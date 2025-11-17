"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.firestore = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
// In a Cloud Function environment, `initializeApp()` with no arguments 
// will use the project's service account credentials automatically.
(0, app_1.initializeApp)({ credential: (0, app_1.applicationDefault)() });
exports.firestore = (0, firestore_1.getFirestore)();
//# sourceMappingURL=firebase.js.map