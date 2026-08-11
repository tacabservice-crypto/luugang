/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let firestoreDb: Firestore | null = null;

try {
  if (getApps().length === 0) {
    const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountEnv) {
      const serviceAccount = JSON.parse(Buffer.from(serviceAccountEnv, 'base64').toString('ascii'));
      initializeApp({
        credential: cert(serviceAccount)
      });
      console.log('Firebase Admin SDK initialized successfully.');
      firestoreDb = getFirestore();
    }
  } else {
    firestoreDb = getFirestore(getApp());
  }
} catch (error) {
  console.error('Firebase Admin SDK initialization error:', error);
}

export const db = firestoreDb;
