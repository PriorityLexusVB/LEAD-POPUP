
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// This is the correct and definitive configuration for your project.
// It points directly to the 'priority-lead-sync' project.
const firebaseConfig = {
  projectId: "priority-lead-sync",
  appId: "1:27409891046:web:6816fad326e6f7b0c28527", 
  storageBucket: "priority-lead-sync.appspot.com",
  apiKey: "AIzaSyACeCULtIczV2Jb7rdbYctDY82FaB2GTsA", 
  authDomain: "priority-lead-sync.firebaseapp.com",
  messagingSenderId: "27409891046",
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
// Point to the default database to match the function.
const db = getFirestore(app);

export { db };
