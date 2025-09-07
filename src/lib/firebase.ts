
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// This is the correct configuration for your project.
const firebaseConfig = {
  "projectId": "priority-lead-sync-jts63",
  "appId": "1:27409891046:web:6816fad326e6f7b0c28527",
  "storageBucket": "priority-lead-sync-jts63.firebasestorage.app",
  "apiKey": "AIzaSyACeCULtIczV2Jb7rdbYctDY82FaB2GTsA",
  "authDomain": "priority-lead-sync-jts63.firebaseapp.com",
  "messagingSenderId": "27409891046"
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
// Connect to the specific 'pop-up-leads' database.
const db = getFirestore(app, 'pop-up-leads');

export { db };
