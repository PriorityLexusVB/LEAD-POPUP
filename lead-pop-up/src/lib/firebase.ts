import { initializeApp, getApps } from "firebase/app";
import { initializeFirestore, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
  if (typeof window !== "undefined") {
    console.error("[firebase] Missing env vars. Check lead-pop-up/.env");
  }
}

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const db = (() => {
  try {
    const db = initializeFirestore(app, {
      experimentalForceLongPolling: true,
      // @ts-expect-error supported at runtime
      useFetchStreams: false,
      // @ts-expect-error supported at runtime
      longPollingOptions: { timeoutSeconds: 10 },
      ignoreUndefinedProperties: true,
    } as any);
    return db;
  } catch {
    return getFirestore(app);
  }
})();
