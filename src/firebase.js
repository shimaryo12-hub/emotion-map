import { initializeApp } from "firebase/app";
import { getFirestore,connectFirestoreEmulator } from "firebase/firestore";

// Key
const firebaseConfig = {
  apiKey: "AIzaSyDBDZCrD-3NZ36j7zlj_SYmMeFgM1yAn84",
  authDomain: "kannjo-map.firebaseapp.com",
  projectId: "kannjo-map",
  storageBucket: "kannjo-map.firebasestorage.app",
  messagingSenderId: "988137599166",
  appId: "1:988137599166:web:4bcc8b1143c8869a296eef",
  measurementId: "G-VWBY07D9ZJ"
};

// 初期化
const app = initializeApp(firebaseConfig);

// Firestoreを使えるようにする
export const db = getFirestore(app);

if(import.meta.env.DEV){
  connectFirestoreEmulator(db, "localhost", 8080);
}