import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Key
const firebaseConfig = {
  apiKey: "AIzaSyBP8ASvUKMZ1dbwr2AKdogCPkS2Jq2Yaqs",
  authDomain: "kannjo-map.firebaseapp.com",
  projectId: "kannjo-map",
  storageBucket: "kannjo-map.appspot.com",
  messagingSenderId: "988137599166",
  appId: "1:988137599166:web:4bcc8b1143c8869a296eef",
  measurementId: "G-VWBY07D9ZJ"
};

// 初期化
const app = initializeApp(firebaseConfig);

// Firestoreを使えるようにする
export const db = getFirestore(app);
