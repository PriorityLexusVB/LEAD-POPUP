
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// This is the correct and definitive configuration for your project.
// It points directly to the 'priority-lead-sync-jts63' project.
const firebaseConfig = {
  projectId: "priority-lead-sync-jts63",
  appId: "1:27409891046:web:6816fad326e6f7b0c28527",
  storageBucket: "priority-lead-sync-jts63.appspot.com",
  apiKey: "AIzaSyACeCULtIczV2Jb7rdbYctDY82FaB2GTsA",
  authDomain: "priority-lead-sync-jts63.firebaseapp.com",
  messagingSenderId: "27409891046",
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
// Connect to the specific 'leads' database.
const db = getFirestore(app, 'leads');

export { db };
