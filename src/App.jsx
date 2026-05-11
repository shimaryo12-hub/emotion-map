import React, { useEffect, useState } from "react";
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
  getDocs,
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
  lat: 35.0116,
  lng: 135.7681,
};

// =============================
// 感情と絵文字の対応
// =============================
const emojiMap = {
  happy: "😊",
  sad: "😓",
  angry: "😡",
};

function App() {
  const [markers, setMarkers] = useState([]);
  const [selected, setSelected] = useState(null);

  // 投稿関連
  const [newLocation, setNewLocation] = useState(null);
  const [emotion, setEmotion] = useState("happy");
  const [text, setText] = useState("");

  // フィルター
  const [filter, setFilter] = useState("all");

  // =============================
  // データ取得（時間順）
  // =============================
  const fetchMarkers = async () => {
    const q = query(
      collection(db, "emotions"),
      orderBy("createdAt", "desc") // 最新順
    );

    const querySnapshot = await getDocs(q);
    const data = querySnapshot.docs.map(doc => doc.data());

    setMarkers(data);
  };

  useEffect(() => {
    fetchMarkers();
  }, []);

  // =============================
  // 地図クリック → 投稿開始
  // =============================
  const handleMapClick = (e) => {
    setNewLocation({
      lat: e.latLng.lat(),
      lng: e.latLng.lng(),
    });
  };

  // =============================
  // 投稿処理
  // =============================
  const handleSubmit = async () => {
    if (!newLocation) return;

    console.log("Submitting:", {
      lat: newLocation.lat,
      lng: newLocation.lng,
      emotion,
      text,
    });

    await addDoc(collection(db, "emotions"), {
      lat: newLocation.lat,
      lng: newLocation.lng,
      emotion,
      text,
      createdAt: new Date(),
    });

    setNewLocation(null);
    setText("");
    fetchMarkers();
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
          <span onClick={() => setFilter("happy")}>😊</span>{" "}
          <span onClick={() => setFilter("sad")}>😓</span>{" "}
          <span onClick={() => setFilter("angry")}>😡</span>
        </div>

        {/* =============================
            投稿UI（LINE風）
        ============================= */}
        {newLocation && (
          <div
            style={{
              position: "absolute",
              bottom: "20px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "#ffffff",
              padding: "15px",
              borderRadius: "15px",
              width: "320px",
              boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ marginBottom: "5px" }}>
              感情を選択
            </div>

            {/* 絵文字選択（選択状態あり） */}
            <div style={{ fontSize: "26px" }}>
              {["happy", "sad", "angry"].map((e) => (
                <span
                  key={e}
                  onClick={() => setEmotion(e)}
                  style={{
                    marginRight: "10px",
                    cursor: "pointer",
                    border:
                      emotion === e
                        ? "2px solid #00c853"
                        : "none",
                    borderRadius: "50%",
                    padding: "5px",
                  }}
                >
                  {emojiMap[e]}
                </span>
              ))}
            </div>

            {/* LINE風コメント */}
            <textarea
              placeholder="今の気持ちを入力..."
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
              }}
            >
              投稿する
            </button>
          </div>
        )}
      </GoogleMap>
    </LoadScript>
  );
}

export default App;