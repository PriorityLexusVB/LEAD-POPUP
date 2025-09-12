// electron-app/src/lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

// Read everything from Vite env (must start with VITE_)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID, // optional
};

// Helpful console if something’s missing
if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
  // eslint-disable-next-line no-console
  console.error(
    "[firebase] Missing config. Check electron-app/.env for VITE_FIREBASE_* values."
  );
}

// Single app instance
export const app =
  getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Electron-friendly Firestore init:
// - Long polling avoids issues on certain networks/containers
// - No fetch streams (Electron quirk)
// - Durable local cache; safe for multi-window
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
  ignoreUndefinedProperties: true,
});

// If you later add Auth, do it in a separate module (don’t import Analytics in Electron).
// Example (when needed):
// import { getAuth } from "firebase/auth";
// export const auth = getAuth(app);

// Optional: emulator toggle (only if you use it)
// if (import.meta.env.VITE_USE_EMULATOR === "1") {
//   connectFirestoreEmulator(db, "127.0.0.1", 8080);
// }
