import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import { Agent, PlayerAgentRequest, VipSubscription, Tournament, TournamentMatch } from './types/game';

export const initializeFirebase = () => {
  let db: Firestore | null = null;
  let auth: Auth | null = null;

  // Your existing Firebase initialization logic here...

  return { db, auth };
};

export const validateAndGetDb = (db: Firestore | null): Firestore => {
  if (!db) {
    throw new Error('Firestore is not initialized. Please check your Firebase configuration.');
  }
  return db;
};
