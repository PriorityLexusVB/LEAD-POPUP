
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

// This is the correct and definitive configuration for your project.
const firebaseConfig = {
  projectId: "priority-lead-sync",
  appId: "1:27409891046:web:6816fad326e6f7b0c28527", // App ID is often shared
  storageBucket: "priority-lead-sync.appspot.com", // Corrected bucket
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, // Use environment variables for API key
  authDomain: "priority-lead-sync.firebaseapp.com", // Corrected auth domain
  messagingSenderId: "27409891046", // Sender ID is often shared
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
// Point to the default database to match the function.
const db = getFirestore(app);

export { db };
