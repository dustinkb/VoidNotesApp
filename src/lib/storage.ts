import { Note } from '../types';

const DB_NAME = 'VoidNotesDB';
const DB_VERSION = 1;
const STORE_NAME = 'notes';
const LAST_NOTE_KEY = 'void_notes_last_id';
const LOCAL_BACKUP_KEY = 'void_notes_backup_snapshot';
const DELETED_IDS_KEY = 'void_notes_deleted_ids';

export type SyncStatus = 'saving' | 'saved' | 'synced' | 'offline' | 'error';

type StatusListener = (status: SyncStatus, message?: string) => void;
const statusListeners = new Set<StatusListener>();

let currentStatus: SyncStatus = 'saved';

function notifyStatus(status: SyncStatus, message?: string) {
  currentStatus = status;
  statusListeners.forEach((listener) => {
    try {
      listener(status, message);
    } catch (e) {
      console.error('Error in storage status listener:', e);
    }
  });
}

// ----------------------------------------------------
// LocalStorage Redundancy & Crash-Proof Layer
// ----------------------------------------------------

function getDeletedIdsFromLocal(): string[] {
  try {
    const raw = localStorage.getItem(DELETED_IDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function recordDeletedIdInLocal(id: string) {
  try {
    const ids = getDeletedIdsFromLocal();
    if (!ids.includes(id)) {
      ids.push(id);
      localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(ids.slice(-300)));
    }
  } catch (e) {
    console.error('Failed to record deleted ID in localStorage:', e);
  }
}

function getNotesFromLocalStorage(): Note[] {
  try {
    const raw = localStorage.getItem(LOCAL_BACKUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to read notes from localStorage backup:', e);
    return [];
  }
}

function saveNotesToLocalStorage(notes: Note[]): void {
  try {
    localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(notes));
  } catch (e) {
    console.warn('LocalStorage snapshot write warning (possibly quota):', e);
  }
}

function mirrorNoteToLocalStorage(note: Note): void {
  try {
    const notes = getNotesFromLocalStorage();
    const idx = notes.findIndex((n) => n.id === note.id);
    if (idx >= 0) {
      notes[idx] = note;
    } else {
      notes.unshift(note);
    }
    saveNotesToLocalStorage(notes);
  } catch (e) {
    console.error('Failed to mirror note to localStorage:', e);
  }
}

function removeNoteFromLocalStorage(id: string): void {
  try {
    const notes = getNotesFromLocalStorage();
    const filtered = notes.filter((n) => n.id !== id);
    saveNotesToLocalStorage(filtered);
    recordDeletedIdInLocal(id);
  } catch (e) {
    console.error('Failed to remove note from localStorage:', e);
  }
}

// ----------------------------------------------------
// IndexedDB Layer
// ----------------------------------------------------

let dbInstance: IDBDatabase | null = null;

const getDB = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined') {
        return reject(new Error('IndexedDB not supported in this environment'));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error || new Error('Unknown IndexedDB error'));
      request.onsuccess = () => {
        dbInstance = request.result;
        dbInstance.onversionchange = () => {
          dbInstance?.close();
          dbInstance = null;
        };
        resolve(dbInstance);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    } catch (err) {
      reject(err);
    }
  });
};

async function idbGetNotes(): Promise<Note[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const notes = (request.result as Note[]) || [];
        resolve(notes);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('IndexedDB unavailable, falling back to localStorage mirror:', e);
    return [];
  }
}

async function idbSaveNote(note: Note): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(note);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('IndexedDB write skipped (using localStorage fallback):', e);
  }
}

async function idbSaveAllNotes(notes: Note[]): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      for (const note of notes) {
        store.put(note);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (e) {
    console.warn('IndexedDB bulk save skipped:', e);
  }
}

async function idbDeleteNote(id: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('IndexedDB delete skipped:', e);
  }
}

// ----------------------------------------------------
// Debounced Auto-Save & Emergency Flush Engine
// ----------------------------------------------------

const pendingNoteSaves = new Map<string, Note>();
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Flush any pending note saves synchronously/immediately (e.g., on beforeunload)
function flushPendingSaves() {
  if (pendingNoteSaves.size === 0) return;

  const notesToFlush = Array.from(pendingNoteSaves.values());
  pendingNoteSaves.clear();

  for (const note of notesToFlush) {
    // 1. Synchronously mirror to LocalStorage
    mirrorNoteToLocalStorage(note);
    // 2. Asynchronously write to IndexedDB
    idbSaveNote(note).catch(() => {});
  }

  notifyStatus('saved', 'Saved locally');
}

// Emergency flush listeners for page closing/tab switching
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushPendingSaves();
  });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushPendingSaves();
      }
    });
  }

  window.addEventListener('online', () => {
    storage.syncWithServer().catch(() => {});
  });
}

// ----------------------------------------------------
// Storage Public API
// ----------------------------------------------------

function isBackendAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:') {
    return false;
  }
  return true;
}

export const storage = {
  subscribeStatus: (listener: StatusListener) => {
    statusListeners.add(listener);
    listener(currentStatus);
    return () => {
      statusListeners.delete(listener);
    };
  },

  getStatus: () => currentStatus,

  // Load notes with automatic dual-engine reconciliation
  getNotes: async (): Promise<Note[]> => {
    try {
      const [idbNotes, localNotes] = await Promise.all([
        idbGetNotes(),
        Promise.resolve(getNotesFromLocalStorage())
      ]);

      const deletedIds = getDeletedIdsFromLocal();
      const noteMap = new Map<string, Note>();

      // Merge IndexedDB
      for (const note of idbNotes) {
        if (!deletedIds.includes(note.id)) {
          noteMap.set(note.id, note);
        }
      }

      // Merge localStorage (takes higher updatedAt)
      for (const note of localNotes) {
        if (deletedIds.includes(note.id)) continue;
        const existing = noteMap.get(note.id);
        if (!existing || (note.updatedAt || 0) > (existing.updatedAt || 0)) {
          noteMap.set(note.id, note);
        }
      }

      const merged = Array.from(noteMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);

      // Heal both storage layers
      if (merged.length > 0) {
        saveNotesToLocalStorage(merged);
        idbSaveAllNotes(merged).catch(() => {});
      }

      // Trigger background sync with backend if available
      if (isBackendAvailable()) {
        setTimeout(() => {
          storage.syncWithServer().catch(() => {});
        }, 100);
      }

      notifyStatus('saved', 'Loaded from local storage');
      return merged;
    } catch (e) {
      console.error('Failed to load notes:', e);
      const fallback = getNotesFromLocalStorage();
      return fallback;
    }
  },

  // Save note with dual-storage persistence and debounced sync
  saveNote: async (note: Note): Promise<void> => {
    notifyStatus('saving', 'Saving changes...');

    // 1. Immediately mirror to localStorage (instant, sync, crash-proof)
    mirrorNoteToLocalStorage(note);

    // 2. Queue for IndexedDB write
    pendingNoteSaves.set(note.id, note);

    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
    }

    saveDebounceTimer = setTimeout(async () => {
      const noteToSave = pendingNoteSaves.get(note.id);
      pendingNoteSaves.delete(note.id);

      if (noteToSave) {
        await idbSaveNote(noteToSave);
      }
      notifyStatus('saved', 'Saved locally');

      // Schedule background server sync if backend available
      if (isBackendAvailable()) {
        if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
        syncDebounceTimer = setTimeout(() => {
          storage.syncWithServer().catch(() => {});
        }, 1200);
      }
    }, 200);
  },

  // Delete note from all tiers
  deleteNote: async (id: string): Promise<void> => {
    pendingNoteSaves.delete(id);
    removeNoteFromLocalStorage(id);
    await idbDeleteNote(id);

    // Inform server of deletion if backend available
    if (isBackendAvailable()) {
      fetch(`/api/notes/${id}`, { method: 'DELETE' }).catch(() => {});
    }

    notifyStatus('saved', 'Note deleted');
  },

  // Bidirectional sync with persistent backend
  syncWithServer: async (
    overrideNotes?: Note[]
  ): Promise<{ success: boolean; syncedNotes?: Note[] }> => {
    if (!isBackendAvailable()) {
      notifyStatus('saved', 'Saved locally (Multi-tier)');
      return { success: true };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      notifyStatus('offline', 'Offline (saved locally)');
      return { success: false };
    }

    try {
      const clientNotes = overrideNotes || getNotesFromLocalStorage();
      const clientDeletedIds = getDeletedIdsFromLocal();

      const response = await fetch('/api/notes/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientNotes, clientDeletedIds })
      });

      if (!response.ok) {
        throw new Error(`Sync server responded with ${response.status}`);
      }

      const data = await response.json();
      if (Array.isArray(data.notes)) {
        const syncedNotes = data.notes as Note[];
        // Update both local storage layers with verified server-reconciled notes
        saveNotesToLocalStorage(syncedNotes);
        await idbSaveAllNotes(syncedNotes);
        notifyStatus('synced', 'Synced to cloud');
        return { success: true, syncedNotes };
      }

      notifyStatus('saved', 'Saved locally');
      return { success: true };
    } catch (err) {
      // Offline or network error: perfectly fine, we are local-first
      notifyStatus('offline', 'Saved locally (offline)');
      return { success: false };
    }
  },

  getLastOpenedId: (): string | null => {
    try {
      return localStorage.getItem(LAST_NOTE_KEY);
    } catch (e) {
      console.error('Failed to read last opened note', e);
      return null;
    }
  },

  setLastOpenedId: (id: string | null) => {
    try {
      if (id) {
        localStorage.setItem(LAST_NOTE_KEY, id);
      } else {
        localStorage.removeItem(LAST_NOTE_KEY);
      }
    } catch (e) {
      console.error('Failed to store last opened note', e);
    }
  },

  // Export note file
  exportNote: (note: Note, extension: 'md' | 'txt' = 'md') => {
    const safeTitle =
      (note.title || 'Untitled')
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
        .trim() || 'Untitled';
    const filename = `${safeTitle}.${extension}`;
    const mimeType =
      extension === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
    const blob = new Blob([note.body], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  exportNoteAsTxt: (note: Note) => {
    storage.exportNote(note, 'txt');
  },

  exportNoteAsMd: (note: Note) => {
    storage.exportNote(note, 'md');
  },

  // Complete JSON database backup export
  exportAllNotesBackup: (notes: Note[]) => {
    const backupData = {
      version: 1,
      appName: 'VoidNotes',
      exportedAt: Date.now(),
      totalNotes: notes.length,
      notes
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `void-notes-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // Restore notes from JSON backup string or file
  restoreNotesFromBackup: async (jsonString: string): Promise<Note[]> => {
    try {
      const data = JSON.parse(jsonString);
      let incomingNotes: Note[] = [];

      if (Array.isArray(data)) {
        incomingNotes = data;
      } else if (data && Array.isArray(data.notes)) {
        incomingNotes = data.notes;
      } else {
        throw new Error('Unrecognized backup format');
      }

      // Validate required fields
      const validNotes = incomingNotes.filter(
        (n) => n && typeof n.id === 'string' && typeof n.body === 'string'
      );

      if (validNotes.length === 0) {
        throw new Error('No valid notes found in backup file');
      }

      // Merge with existing notes
      const existing = await storage.getNotes();
      const map = new Map<string, Note>();

      for (const n of existing) {
        map.set(n.id, n);
      }
      for (const n of validNotes) {
        map.set(n.id, n);
      }

      const merged = Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);

      saveNotesToLocalStorage(merged);
      await idbSaveAllNotes(merged);
      await storage.syncWithServer(merged);

      notifyStatus('synced', `Restored ${validNotes.length} notes`);
      return merged;
    } catch (err) {
      console.error('Backup restore failed:', err);
      throw err;
    }
  }
};
