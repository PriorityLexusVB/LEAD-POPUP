
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  "projectId": "priority-lead-sync",
  "appId": "1:27409891046:web:6816fad326e6f7b0c28527",
  "storageBucket": "priority-lead-sync.appspot.com",
  "apiKey": "AIzaSyACeCULtIczV2Jb7rdbYctDY82FaB2GTsA",
  "authDomain": "priority-lead-sync.firebaseapp.com",
  "messagingSenderId": "27409891046"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
// Point to the default database to match the function.
const db = getFirestore(app);

// If you want to connect to the Firestore emulator, uncomment the following lines
// if (process.env.NODE_ENV === 'development') {
//   try {
//     connectFirestoreEmulator(db, 'localhost', 8080);
//     console.log("Connected to Firestore emulator");
//   } catch (error) {
//     console.error("Error connecting to Firestore emulator", error);
//   }
// }

export { db };
