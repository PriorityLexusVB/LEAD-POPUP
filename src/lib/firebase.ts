
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// This is the correct configuration for your project.
const firebaseConfig = {
  projectId: "priority-lead-sync",
  appId: "1:736183911049:web:5a025c35ac94665a39624e",
  storageBucket: "priority-lead-sync.appspot.com",
  apiKey: "AIzaSyBw-fE_2P6YkHYwS_Qjzz6SfgL5e2u7x2E",
  authDomain: "priority-lead-sync.firebaseapp.com",
  messagingSenderId: "736183911049"
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
// Connect to the specific 'leads' database.
const db = getFirestore(app, 'leads');

export { db };
