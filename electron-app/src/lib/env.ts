export function readEnv() {
  // If running under Vite (browser/renderer)
  const vite = (typeof import.meta !== "undefined" && (import.meta as any).env) ? (import.meta as any).env : undefined;

  // If running under Next SSR or Node
  const node = (typeof process !== "undefined" && process.env) ? process.env : undefined;

  // Prefer Vite at runtime, fallback to Node/Next
  const get = (kVite: string, kNext: string) =>
    (vite && vite[kVite] !== undefined ? vite[kVite] :
     node && node[kNext] !== undefined ? node[kNext] :
     undefined);

  return {
    apiKey:      get("VITE_FIREBASE_API_KEY",      "NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain:  get("VITE_FIREBASE_AUTH_DOMAIN",  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId:   get("VITE_FIREBASE_PROJECT_ID",   "NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: get("VITE_FIREBASE_STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: get("VITE_FIREBASE_MESSAGING_SENDER_ID", "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId:       get("VITE_FIREBASE_APP_ID",       "NEXT_PUBLIC_FIREBASE_APP_ID"),
    measurementId: get("VITE_FIREBASE_MEASUREMENT_ID", "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"),
    cdkBaseUrl:  get("VITE_CDK_BASE_URL",          "NEXT_PUBLIC_CDK_BASE_URL"),
    pollOnly:    get("VITE_FIRESTORE_POLL_ONLY",   "NEXT_PUBLIC_FIRESTORE_POLL_ONLY"),
  };
}
