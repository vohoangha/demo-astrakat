
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Your web app's Firebase configuration
// Note: Ensure this API Key is restricted in Google Cloud Console to your domains
const firebaseConfig = {
  apiKey: "AIzaSyAEE8kkji3B4h2DQ2cO1tq4G6HjmIOLdOg",
  authDomain: "astra-kat-couter.firebaseapp.com",
  databaseURL: "https://astra-kat-couter-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "astra-kat-couter",
  storageBucket: "astra-kat-couter.firebasestorage.app",
  messagingSenderId: "46973775395",
  appId: "1:46973775395:web:e6b6859b97b63232274b96"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
