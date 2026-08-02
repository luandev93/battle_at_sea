// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA1SsRvwGp8GOBHDp7PbTCUkQkUJLn2In4",
  authDomain: "battle-at-sea-62016.firebaseapp.com",
  projectId: "battle-at-sea-62016",
  storageBucket: "battle-at-sea-62016.firebasestorage.app",
  messagingSenderId: "390700567880",
  appId: "1:390700567880:web:30c21be661c7177687377d",
  measurementId: "G-N8BB7KHPW0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);

export { auth };