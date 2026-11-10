import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe
} from 'firebase/firestore';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { Note } from '../types';
import { storage } from './storage';

export type FirebaseSyncStatus = 'signed-out' | 'connecting' | 'synced' | 'syncing' | 'offline' | 'error';

type FirebaseStatusListener = (status: FirebaseSyncStatus, user: FirebaseUser | null) => void;
const listeners = new Set<FirebaseStatusListener>();

let currentStatus: FirebaseSyncStatus = 'signed-out';
let currentUser: FirebaseUser | null = null;
let activeNotesUnsubscribe: Unsubscribe | null = null;

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn(currentStatus, currentUser);
    } catch (e) {
      console.error('Error in firebase sync listener:', e);
    }
  });
}

export const firebaseSync = {
  subscribe: (listener: FirebaseStatusListener) => {
    listeners.add(listener);
    listener(currentStatus, currentUser);
    return () => {
      listeners.delete(listener);
    };
  },

  getCurrentUser: () => currentUser,
  getStatus: () => currentStatus,

  // Initialize listener on auth state
  init: (onRemoteNotesUpdated?: (notes: Note[]) => void) => {
    return onAuthStateChanged(auth, async (user) => {
      currentUser = user;

      // Clean up previous snapshot listener if any
      if (activeNotesUnsubscribe) {
        activeNotesUnsubscribe();
        activeNotesUnsubscribe = null;
      }

      if (!user) {
        currentStatus = 'signed-out';
        notifyListeners();
        return;
      }

      currentStatus = 'connecting';
      notifyListeners();

      // Ensure user profile document exists
      const userDocPath = `users/${user.uid}`;
      try {
        await setDoc(
          doc(db, 'users', user.uid),
          {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || '',
            createdAt: new Date().toISOString()
          },
          { merge: true }
        );
      } catch (err) {
        // Log with required error format
        handleFirestoreError(err, OperationType.WRITE, userDocPath);
      }

      // First push existing local notes to user cloud collection so nothing is lost
      try {
        const localNotes = await storage.getNotes();
        for (const note of localNotes) {
          const notePath = `users/${user.uid}/notes/${note.id}`;
          try {
            await setDoc(
              doc(db, 'users', user.uid, 'notes', note.id),
              {
                id: note.id,
                title: note.title || '',
                body: note.body || '',
                createdAt: note.createdAt || Date.now(),
                updatedAt: note.updatedAt || Date.now(),
                isPinned: Boolean(note.isPinned),
                userId: user.uid,
                serverUpdatedAt: serverTimestamp()
              },
              { merge: true }
            );
          } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, notePath);
          }
        }
      } catch (e) {
        console.warn('Initial local-to-cloud sync completed with notice:', e);
      }

      // Attach live real-time multi-device listener
      const notesCollectionPath = `users/${user.uid}/notes`;
      const notesRef = collection(db, 'users', user.uid, 'notes');

      activeNotesUnsubscribe = onSnapshot(
        notesRef,
        async (snapshot) => {
          currentStatus = 'synced';
          notifyListeners();

          const remoteNotes: Note[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            remoteNotes.push({
              id: data.id,
              title: data.title || '',
              body: data.body || '',
              createdAt: Number(data.createdAt) || Date.now(),
              updatedAt: Number(data.updatedAt) || Date.now(),
              isPinned: Boolean(data.isPinned)
            });
          });

          // Sort descending by updated timestamp
          remoteNotes.sort((a, b) => b.updatedAt - a.updatedAt);

          if (onRemoteNotesUpdated) {
            onRemoteNotesUpdated(remoteNotes);
          }
        },
        (error) => {
          currentStatus = 'error';
          notifyListeners();
          handleFirestoreError(error, OperationType.GET, notesCollectionPath);
        }
      );
    });
  },

  // Save or update note in Firestore for this user
  syncNote: async (note: Note) => {
    if (!currentUser) return;
    const path = `users/${currentUser.uid}/notes/${note.id}`;

    try {
      await setDoc(
        doc(db, 'users', currentUser.uid, 'notes', note.id),
        {
          id: note.id,
          title: note.title || '',
          body: note.body || '',
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          isPinned: Boolean(note.isPinned),
          userId: currentUser.uid,
          serverUpdatedAt: serverTimestamp()
        },
        { merge: true }
      );
      currentStatus = 'synced';
      notifyListeners();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  // Delete note from Firestore
  deleteNote: async (noteId: string) => {
    if (!currentUser) return;
    const path = `users/${currentUser.uid}/notes/${noteId}`;

    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'notes', noteId));
      currentStatus = 'synced';
      notifyListeners();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
};
