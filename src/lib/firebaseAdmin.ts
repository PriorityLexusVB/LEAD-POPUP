import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = getApps().length ? getApps()[0] : initializeApp({ credential: applicationDefault() });
export const adminDb = getFirestore(app);
