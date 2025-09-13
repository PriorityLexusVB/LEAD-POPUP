import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({ storageBucket: "priority-lead-sync-jts63.appspot.com" });
export const firestore = getFirestore(app);
