import { initializeApp, getApps } from "firebase/app";
import { initializeFirestore, getFirestore } from "firebase/firestore";

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

if (!cfg.projectId || !cfg.apiKey) {
  if (import.meta.env.DEV) console.error("[firebase] Missing VITE_FIREBASE_* env in electron-app/.env");
}

export const app = getApps().length ? getApps()[0] : initializeApp(cfg);

export const db = (() => {
  try {
    const db = initializeFirestore(app, {
      experimentalForceLongPolling: true,
      // @ts-expect-error: allowed at runtime
      useFetchStreams: false,
      // @ts-expect-error: allowed at runtime
      longPollingOptions: { timeoutSeconds: 10 },
      ignoreUndefinedProperties: true,
    } as any);
    if (import.meta.env.DEV) console.info("[firestore] long-polling transport enabled");
    return db;
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[firestore] initializeFirestore failed; fallback getFirestore()", e);
    return getFirestore(app);
  }
})();
