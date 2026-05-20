import { useEffect, useState } from "react";
import {
  GoogleMap,
  LoadScript,
  Marker,
  InfoWindow,
} from "@react-google-maps/api";
import { db } from "./firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

// =============================
// 地図コンテナ設定
// =============================
const containerStyle = {
  width: "100%",
  height: "100vh",
};

const center = {
  lat: 34.8193,
  lng: 135.7788,
};

const mapOptions = {
  minZoom: 12,
  maxZoom: 16,
};

// =============================
// 感情と絵文字の対応
// =============================
const emotionOptions = [
  { key: "happy", emoji: "😊", label: "うれしい" },
  { key: "sad", emoji: "😓", label: "かなしい" },
  { key: "angry", emoji: "😡", label: "おこっている" },
  { key: "excited", emoji: "😆", label: "たのしい" },
  { key: "relaxed", emoji: "😌", label: "リラックス" },
  { key: "healing", emoji: "🥰", label: "いやし" },
];

const emojiMap = emotionOptions.reduce((map, item) => {
  map[item.key] = item.emoji;
  return map;
}, {});

const instagramUrl = "https://www.instagram.com/kizugawa_virtual/";

function App() {
  const [markers, setMarkers] = useState([]);
  const [selected, setSelected] = useState(null);

  // 投稿関連
  const [newLocation, setNewLocation] = useState(null);
  const [emotion, setEmotion] = useState(emotionOptions[0].key);
  const [text, setText] = useState("");

  // フィルター
  const [filter, setFilter] = useState("all");

  // スワイプ機能
  const [touchStart, setTouchStart] = useState(null);
  const emotionIndex = emotionOptions.findIndex((opt) => opt.key === emotion);

  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e) => {
    if (!touchStart) return;

    const touchEnd = e.changedTouches[0].clientX;
    const distance = touchStart - touchEnd;

    // 50px以上スワイプで感情切り替え
    if (Math.abs(distance) > 50) {
      if (distance > 0) {
        // 左スワイプ：次の感情へ
        const nextIndex = (emotionIndex + 1) % emotionOptions.length;
        setEmotion(emotionOptions[nextIndex].key);
      } else {
        // 右スワイプ：前の感情へ
        const prevIndex =
          (emotionIndex - 1 + emotionOptions.length) % emotionOptions.length;
        setEmotion(emotionOptions[prevIndex].key);
      }
    }

    setTouchStart(null);
  };

  useEffect(() => {
    const q = query(
      collection(db, "emotions"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => doc.data());
      setMarkers(data);
    });

    return () => unsubscribe();
  }, []);

  // =============================
  // 地図クリック → 投稿開始
  // =============================
  const handleMapClick = (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();

    setNewLocation({
      lat,
      lng,
    });
  };

  // =============================
  // 投稿処理
  // =============================
  const handleSubmit = async () => {
    if (!newLocation) return;

    try {
      await addDoc(collection(db, "emotions"), {
        lat: newLocation.lat,
        lng: newLocation.lng,
        emotion,
        text,
        createdAt: new Date(),
      });

      setNewLocation(null);
      setText("");
    } catch (error) {
      console.error("Submit failed", error);
      alert("投稿中にエラーが発生しました。もう一度お試しください。");
    }
  };

  // =============================
  // フィルタリング
  // =============================
  const filteredMarkers =
    filter === "all"
      ? markers
      : markers.filter((m) => m.emotion === filter);

  // =============================
  // 簡易クラスタ（熱度）
  // 近い点の数でサイズ変化
  // =============================
  const getHeatSize = (target) => {
    const count = markers.filter((m) => {
      const dist =
        Math.abs(m.lat - target.lat) +
        Math.abs(m.lng - target.lng);
      return dist < 0.01; // 近い範囲
    }).length;

    return Math.min(40, 20 + count * 3); // サイズ拡大
  };

// Maps JavaScript API キーを下記に入力
  return (
    <LoadScript googleMapsApiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={13}
        options={mapOptions}
        onClick={handleMapClick}
      >
        {/* =============================
            Marker表示
        ============================= */}
        {filteredMarkers.map((m, i) => (
          <Marker
            key={i}
            position={{ lat: m.lat, lng: m.lng }}
            label={{
              text: emojiMap[m.emotion],
              fontSize: `${getHeatSize(m)}px`, // 熱度反映
            }}
            onClick={() => setSelected(m)}
          />
        ))}

        {/* =============================
            コメント表示（吹き出し）
        ============================= */}
        {selected && (
          <InfoWindow
            position={{ lat: selected.lat, lng: selected.lng }}
            onCloseClick={() => setSelected(null)}
          >
            <div
              style={{
                background: "#f1f1f1",
                padding: "10px",
                borderRadius: "10px",
              }}
            >
              <div style={{ fontSize: "22px" }}>
                {emojiMap[selected.emotion]}
              </div>
              <div>{selected.text || "（コメントなし）"}</div>
            </div>
          </InfoWindow>
        )}

        {/* =============================
            フィルターUI（上部）
        ============================= */}
        <div
          style={{
            position: "absolute",
            top: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "white",
            padding: "8px 12px",
            borderRadius: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          <span onClick={() => setFilter("all")}>🌏</span>{" "}
          {emotionOptions.map((option) => (
            <span
              key={option.key}
              onClick={() => setFilter(option.key)}
              style={{ marginRight: "6px", cursor: "pointer" }}
            >
              {option.emoji}
            </span>
          ))}
        </div>

        {/* =============================
            投稿UI（LINE風）
        ============================= */}
        {newLocation && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              bottom: "20px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "#ffffff",
              padding: "15px",
              borderRadius: "15px",
              width: "min(92vw, 320px)",
              boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
              pointerEvents: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <div>感情を選択</div>
              <button
                onClick={() => setNewLocation(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#777",
                  cursor: "pointer",
                  fontSize: "16px",
                }}
                aria-label="戻る"
              >
                ×
              </button>
            </div>

            {/* 絵文字選択（スライド機能付き） */}
            <div
              style={{
                fontSize: "26px",
                overflow: "hidden",
                touchAction: "pan-y",
              }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  transition: "transform 0.2s ease-out",
                  transform: `translateX(${-emotionIndex * 70}px)`,
                }}
              >
                {emotionOptions.map((option) => (
                  <div
                    key={option.key}
                    onClick={() => setEmotion(option.key)}
                    style={{
                      display: "inline-flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      border:
                        emotion === option.key
                          ? "2px solid #00c853"
                          : "2px solid transparent",
                      borderRadius: "50%",
                      padding: "8px",
                      minWidth: "60px",
                      transition: "all 0.2s ease",
                      opacity: emotion === option.key ? 1 : 0.6,
                    }}
                    title={option.label}
                  >
                    <span>{option.emoji}</span>
                    <span
                      style={{
                        fontSize: "12px",
                        marginTop: "4px",
                        color: "#555",
                      }}
                    >
                      {option.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* LINE風コメント */}
            <textarea
              placeholder="感情の理由を入力してください"
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{
                width: "100%",
                marginTop: "10px",
                borderRadius: "10px",
                padding: "8px",
                border: "1px solid #ccc",
              }}
            />

            <button
              onClick={handleSubmit}
              style={{
                marginTop: "10px",
                width: "100%",
                background: "#00c853",
                color: "white",
                border: "none",
                padding: "10px",
                borderRadius: "10px",
                cursor: "pointer",
              }}
            >
              投稿する
            </button>
          </div>
        )}

        {/* =============================
            Instagramリンク（右下）
        ============================= */}
        <div
          style={{
            position: "absolute",
            right: "16px",
            bottom: "16px",
            background: "rgba(255,255,255,0.95)",
            padding: "10px 14px",
            borderRadius: "20px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
            fontWeight: "700",
          }}
        >
          <a
            href={instagramUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              color: "#E1306C",
              textDecoration: "none",
            }}
          >
            木津川Instagram
          </a>
        </div>
      </GoogleMap>
    </LoadScript>
  );
}

export default App;