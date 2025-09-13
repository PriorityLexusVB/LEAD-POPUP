import { initializeApp, getApps } from "firebase/app";
import { initializeFirestore, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
  if (typeof window !== "undefined") {
    console.error("[firebase] Missing env vars. Check .env file in root.");
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
