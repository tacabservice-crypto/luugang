/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as admin from 'firebase-admin';

// This is the recommended way to initialize the Firebase Admin SDK on platforms like Render.
// The service account key is stored in an environment variable.
// See: https://firebase.google.com/docs/admin/setup#initialize-sdk
try {
  // Check if the app is already initialized
  if (admin.apps.length === 0) {
    const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountEnv) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
    }

    // The environment variable is expected to be a base64 encoded JSON string.
    const serviceAccount = JSON.parse(Buffer.from(serviceAccountEnv, 'base64').toString('ascii'));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    
    console.log('Firebase Admin SDK initialized successfully.');
  }
} catch (error) {
  console.error('Firebase Admin SDK initialization error:', error);
  // Do not re-throw the error, as it would crash the server on startup if the env var is missing.
  // The application can run without a database connection, but will not be able to persist data.
}

export const db = admin.apps.length > 0 ? admin.firestore() : null;
