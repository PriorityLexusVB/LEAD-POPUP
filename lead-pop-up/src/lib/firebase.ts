
import { initializeApp, getApps } from "firebase/app";
import { initializeFirestore, getFirestore } from "firebase/firestore";
import { readEnv } from "./env";

const e = readEnv();

if (!e.projectId || !e.apiKey) {
  if (typeof window !== "undefined") {
    console.error("[firebase] Missing env vars. Check lead-pop-up/.env (Vite) or NEXT_PUBLIC_* (Next).");
  }
}

const firebaseConfig = {
  apiKey: e.apiKey,
  authDomain: e.authDomain,
  projectId: e.projectId,
  storageBucket: e.storageBucket,
  messagingSenderId: e.messagingSenderId,
  appId: e.appId,
  measurementId: e.measurementId,
};

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
