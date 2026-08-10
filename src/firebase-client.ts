// src/firebase-client.ts
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { UserProfile } from './types/game';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAWJyBQKaL83HTd5nLirtejA3wNaUhia9k',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'dhilidhili.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'dhilidhili',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'dhilidhili.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '760096560567',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:760096560567:web:f6e1f923ab1afab2470432',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-4XDTHBHT86'
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const auth = getAuth(app);

// A custom user type that merges Firebase Auth user and our custom profile
export type AppUser = UserProfile & {
    uid: string;
    email: string | null;
    idToken: string;
};

export const useAuth = () => {
  const [appUser, setAppUser] = useState<AppUser | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      if (authUser) {
        const userDocRef = doc(db, 'users', authUser.uid);
        
        const unsubscribeProfile = onSnapshot(userDocRef, async (snapshot) => {
            const idToken = await authUser.getIdToken();
            if (snapshot.exists()) {
                const userProfile = snapshot.data() as UserProfile;
                setAppUser({
                    ...userProfile,
                    uid: authUser.uid,
                    email: authUser.email,
                    idToken: idToken,
                });
            } else {
                 setAppUser({
                    id: authUser.uid,
                    uid: authUser.uid,
                    username: authUser.displayName || 'Anonymous',
                    email: authUser.email,
                    avatar: authUser.photoURL || '',
                    balance: 0,
                    winCount: 0,
                    lossCount: 0,
                    idToken: idToken,
                });
            }
        });
        return unsubscribeProfile;

      } else {
        setAppUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  return { user: appUser };
};

export let analytics: ReturnType<typeof getAnalytics> | null = null;

if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {
    analytics = null;
  });
}
