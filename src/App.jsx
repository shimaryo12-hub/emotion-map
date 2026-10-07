import { useEffect, useState } from "react";
import {
  GoogleMap,
  LoadScript,
  Marker,
  InfoWindow,
} from "@react-google-maps/api";
import { db, storage } from "./firebase";
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

// =============================
// 地図コンテナ設定
// =============================
const containerStyle = {
  width: "100%",
  height: "100vh",
};

const center = {
  lat: 34.7339108,
  lng: 135.8229556,
};

// const mapOptions = {
//   minZoom: 12,
//   maxZoom: 16,
// };

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
const maxPhotoSize = 5 * 1024 * 1024;
const maxOriginalPhotoSize = 20 * 1024 * 1024;
const allowedPhotoTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const compressPhoto = async (file) => {
  if (file.type === "image/gif") return file;

  const image = await createImageBitmap(file);
  try {
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo compression is not supported.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const toWebp = (quality) =>
      new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("Photo compression failed.")),
          "image/webp",
          quality
        );
      });

    let compressed = await toWebp(0.82);
    if (compressed.size > maxPhotoSize) compressed = await toWebp(0.65);
    if (compressed.size > maxPhotoSize) {
      const reducedCanvas = document.createElement("canvas");
      reducedCanvas.width = Math.round(canvas.width * 0.75);
      reducedCanvas.height = Math.round(canvas.height * 0.75);
      const reducedContext = reducedCanvas.getContext("2d");
      if (!reducedContext) throw new Error("Photo compression is not supported.");
      reducedContext.drawImage(
        canvas,
        0,
        0,
        reducedCanvas.width,
        reducedCanvas.height
      );
      compressed = await new Promise((resolve, reject) => {
        reducedCanvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("Photo compression failed.")),
          "image/webp",
          0.65
        );
      });
    }

    return compressed;
  } finally {
    image.close();
  }
};

function App() {
  const [markers, setMarkers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [mapCenter, setMapCenter] = useState(center);

  // 投稿関連
  const [newLocation, setNewLocation] = useState(null);
  const [emotion, setEmotion] = useState(emotionOptions[0].key);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState(null);
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  useEffect(() => {
    return () => {
      if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
    };
  }, [photo]);

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
      const data = snapshot.docs.map((emotionDoc) => ({
        id: emotionDoc.id,
        ...emotionDoc.data(),
      }));
      setMarkers(data);
    });

    return () => unsubscribe();
  }, []);

  // =============================
  // 地図クリック → 投稿開始
  // =============================
  const handleMapClick = (e) => {
    if (!e.latLng) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();

    setNewLocation({
      lat,
      lng,
    });
    setSubmitError("");
    setLocationError("");
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("このブラウザーでは位置情報を利用できません。");
      return;
    }

    setIsLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = {
          lat: coords.latitude,
          lng: coords.longitude,
        };
        setMapCenter(location);
        setNewLocation(location);
        setSubmitError("");
        setIsLocating(false);
      },
      (error) => {
        const messageByCode = {
          1: "位置情報の利用が許可されませんでした。ブラウザーの設定を確認してください。",
          2: "現在地を取得できませんでした。位置情報を有効にして再度お試しください。",
          3: "位置情報の取得がタイムアウトしました。再度お試しください。",
        };
        setLocationError(
          messageByCode[error.code] ?? "位置情報の取得に失敗しました。"
        );
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      }
    );
  };

  // =============================
  // 投稿処理
  // =============================
  const handleSubmit = async () => {
    if (!newLocation || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError("");
    let failureStage = photo ? "写真のアップロード" : "投稿の保存";
    setSubmitStage(photo ? "写真をアップロード中..." : "投稿を保存中...");
    try {
      let photoUrl = "";
      if (photo) {
        const photoRef = ref(storage, `emotions/${crypto.randomUUID()}`);
        const uploadedPhoto = await uploadBytes(photoRef, photo.file, {
          contentType: photo.file.type,
        });
        photoUrl = await getDownloadURL(uploadedPhoto.ref);
      }

      failureStage = "投稿の保存";
      setSubmitStage("投稿を保存中...");
      await addDoc(collection(db, "emotions"), {
        lat: newLocation.lat,
        lng: newLocation.lng,
        emotion,
        text,
        ...(photoUrl && { photoUrl }),
        createdAt: new Date(),
      });

      setNewLocation(null);
      setText("");
      setPhoto(null);
    } catch (error) {
      console.error("Submit failed", error);
      const errorMessages = {
        "storage/unauthorized":
          "写真のアップロードが許可されませんでした。Storageルールが反映されているか確認してください。",
        "storage/bucket-not-found":
          "Firebase Storageのバケットが見つかりません。src/firebase.jsのstorageBucket設定を確認してください。",
        "storage/canceled": "写真のアップロードがキャンセルされました。",
        "permission-denied":
          "投稿の保存が許可されませんでした。Firestoreルールを確認してください。",
        "storage/retry-limit-exceeded":
          "写真のアップロードがタイムアウトしました。通信状態を確認して再度お試しください。",
        "storage/unknown":
          "写真をアップロードできませんでした。Firebase Storageの設定と通信状態を確認してください。",
      };
      const code = error?.code ?? "unknown";
      setSubmitError(
        errorMessages[code] ??
          `${failureStage}に失敗しました（${code}）。通信状態とFirebaseの設定を確認して再度お試しください。`
      );
    } finally {
      setIsSubmitting(false);
      setSubmitStage("");
    }
  };

  const handlePhotoChange = async (event) => {
    const selectedPhoto = event.target.files?.[0];
    event.target.value = "";
    if (!selectedPhoto) return;

    if (!allowedPhotoTypes.includes(selectedPhoto.type)) {
      setSubmitError("JPEG、PNG、WebP、GIF形式の写真を選択してください。");
      return;
    }
    if (selectedPhoto.size > maxOriginalPhotoSize) {
      setSubmitError("写真は20MB以下のファイルを選択してください。");
      return;
    }

    setSubmitError("");
    setPhoto(null);
    setIsPreparingPhoto(true);
    try {
      const compressedPhoto = await compressPhoto(selectedPhoto);
      if (compressedPhoto.size > maxPhotoSize) {
        setSubmitError(
          "写真を5MB以下に圧縮できませんでした。小さい写真を選択してください。"
        );
        return;
      }
      setPhoto({
        file: compressedPhoto,
        previewUrl: URL.createObjectURL(compressedPhoto),
      });
    } catch (error) {
      console.error("Photo compression failed", error);
      setSubmitError("写真を準備できませんでした。別の写真をお試しください。");
    } finally {
      setIsPreparingPhoto(false);
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
        center={mapCenter}
        zoom={15}
        onClick={handleMapClick}
        options={{
          fullscreenControl: false, // 最大化ボタンを消す
        }}
      >
        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            position: "absolute",
            top: "54px",
            right: "10px",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "6px",
            maxWidth: "min(90vw, 360px)",
          }}
        >
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            aria-busy={isLocating}
            style={{
              background: "white",
              border: "none",
              borderRadius: "20px",
              padding: "10px 14px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              cursor: isLocating ? "wait" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {isLocating ? "現在地を取得中..." : "📍 現在地から投稿"}
          </button>
          {locationError && (
            <div
              role="alert"
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                background: "white",
                color: "#c62828",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                fontSize: "13px",
              }}
            >
              {locationError}
            </div>
          )}
        </div>

        {/* 投稿する際に地図がズームアウトする */}
        {/* =============================
            Marker表示
        ============================= */}
        {filteredMarkers.map((m, i) => (
          <Marker
            key={m.id ?? i}
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
              {selected.photoUrl && (
                <img
                  src={selected.photoUrl}
                  alt="投稿に添付された写真"
                  style={{
                    display: "block",
                    maxWidth: "240px",
                    maxHeight: "180px",
                    marginTop: "8px",
                    borderRadius: "8px",
                    objectFit: "cover",
                  }}
                />
              )}
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
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
              style={{
                width: "100%",
                marginTop: "10px",
                borderRadius: "10px",
                padding: "8px",
                border: "1px solid #ccc",
                fontSize: "16px", // ← スマホ拡大防止
                resize: "none", // 任意：サイズ変更禁止
                boxSizing: "border-box",
              }}
            />

            {photo?.previewUrl && (
              <div style={{ position: "relative", marginTop: "8px" }}>
                <img
                  src={photo.previewUrl}
                  alt="添付する写真のプレビュー"
                  style={{
                    display: "block",
                    maxWidth: "100%",
                    maxHeight: "160px",
                    borderRadius: "8px",
                    objectFit: "cover",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  aria-label="写真を取り消す"
                  style={{
                    position: "absolute",
                    top: "6px",
                    right: "6px",
                    width: "28px",
                    height: "28px",
                    border: "none",
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.65)",
                    color: "white",
                    cursor: "pointer",
                    fontSize: "18px",
                  }}
                >
                  ×
                </button>
              </div>
            )}

            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                marginTop: "8px",
                padding: "7px 10px",
                border: "1px solid #ccc",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              {isPreparingPhoto ? "写真を準備中..." : "📷 写真を追加"}
              <input
                type="file"
                accept={allowedPhotoTypes.join(",")}
                onChange={handlePhotoChange}
                disabled={isPreparingPhoto || isSubmitting}
                aria-label="投稿に添付する写真を選択"
                style={{
                  position: "absolute",
                  width: "1px",
                  height: "1px",
                  padding: 0,
                  margin: "-1px",
                  overflow: "hidden",
                  clip: "rect(0, 0, 0, 0)",
                  whiteSpace: "nowrap",
                  border: 0,
                }}
              />
            </label>
            <span style={{ marginLeft: "8px", color: "#777", fontSize: "12px" }}>
              20MBまで・写真は自動圧縮
            </span>

            {submitError && (
              <div role="alert" style={{ marginTop: "8px", color: "#c62828" }}>
                {submitError}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={isSubmitting || isPreparingPhoto}
              aria-busy={isSubmitting || isPreparingPhoto}
              style={{
                marginTop: "10px",
                width: "100%",
                background:
                  isSubmitting || isPreparingPhoto ? "#8a8a8a" : "#00c853",
                color: "white",
                border: "none",
                padding: "10px",
                borderRadius: "10px",
                cursor:
                  isSubmitting || isPreparingPhoto ? "wait" : "pointer",
              }}
            >
              {isPreparingPhoto
                ? "写真を準備中..."
                : isSubmitting
                  ? submitStage || "投稿中..."
                  : "投稿する"}
            </button>
          </div>
        )}

        {/* =============================
            Instagramリンク（左下）
        ============================= */}
        <div
          style={{
            position: "absolute",
            left: "16px",
            bottom: newLocation ? "340px" : "16px",
            transition: "bottom 0.2s ease",
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