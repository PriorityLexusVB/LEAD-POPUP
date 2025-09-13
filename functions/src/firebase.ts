import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// In a Cloud Function environment, `initializeApp()` with no arguments 
// will use the project's service account credentials automatically.
initializeApp({ credential: applicationDefault() });

export const firestore = getFirestore();
