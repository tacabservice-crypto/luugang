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
    let sse: EventSource | null = null;
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        try {
          const idToken = await authUser.getIdToken();
          const apiBase = import.meta.env.VITE_API_BASE_URL || '';

          // Fetch profile from backend store to ensure real balance and data
          const res = await fetch(`${apiBase}/api/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({ email: authUser.email }),
          });

          if (res.ok) {
            const profileData = await res.json();
            const userObj: AppUser = {
              ...profileData,
              uid: authUser.uid,
              email: authUser.email || profileData.email,
              idToken,
            };
            setAppUser(userObj);

            // Connect to real-time updates for this user
            if (profileData.id) {
              if (sse) sse.close();
              sse = new EventSource(`${apiBase}/api/updates?userId=${profileData.id}`);
              sse.addEventListener('user_update', (e: MessageEvent) => {
                try {
                  const updatedProfile = JSON.parse(e.data);
                  setAppUser((prev) => (prev ? { ...prev, ...updatedProfile } : null));
                } catch (err) {
                  console.error('Error parsing user_update SSE event:', err);
                }
              });
            }
          } else {
            // Fallback to Firestore listener if API login fails
            const userDocRef = doc(db, 'users', authUser.uid);
            unsubscribeProfile = onSnapshot(userDocRef, (snapshot) => {
              if (snapshot.exists()) {
                const userProfile = snapshot.data() as UserProfile;
                setAppUser({
                  ...userProfile,
                  uid: authUser.uid,
                  email: authUser.email,
                  idToken,
                });
              } else {
                setAppUser({
                  id: authUser.uid,
                  uid: authUser.uid,
                  username: authUser.displayName || 'Anonymous',
                  email: authUser.email,
                  avatar: authUser.photoURL || '🎮',
                  balance: 0,
                  winCount: 0,
                  lossCount: 0,
                  idToken,
                });
              }
            });
          }
        } catch (err) {
          console.error('Auth profile sync error in useAuth:', err);
        }
      } else {
        if (sse) sse.close();
        if (unsubscribeProfile) unsubscribeProfile();
        setAppUser(null);
      }
    });

    return () => {
      if (sse) sse.close();
      if (unsubscribeProfile) unsubscribeProfile();
      unsubscribeAuth();
    };
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
