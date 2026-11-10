import React, { useState, useEffect, useCallback, useRef, ChangeEvent } from 'react';
import { Note } from './types';
import { storage, SyncStatus } from './lib/storage';
import { loginWithGoogle, logout } from './lib/firebase';
import { firebaseSync, FirebaseSyncStatus } from './lib/firebaseSync';
import { User as FirebaseUser } from 'firebase/auth';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { ArrowDownCircle, FileUp } from 'lucide-react';
import { motion } from 'motion/react';

const generateId = () => Math.random().toString(36).substring(2, 11);

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const isStandaloneDisplay = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneDisplay());
  const [isInstallPromptOpen, setIsInstallPromptOpen] = useState(false);
  const [isLightMode, setIsLightMode] = useState(() => {
    return localStorage.getItem('theme') === 'light';
  });

  useEffect(() => {
    if (isLightMode) {
      document.documentElement.classList.add('light-mode');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.remove('light-mode');
      localStorage.setItem('theme', 'dark');
    }
  }, [isLightMode]);

  const toggleTheme = useCallback(() => {
    setIsLightMode(prev => !prev);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)');

    const handleBeforeInstallPrompt = (e: Event) => {
      if (isStandaloneDisplay()) {
        setDeferredPrompt(null);
        return;
      }

      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    const handleDisplayModeChange = () => {
      const installed = isStandaloneDisplay();
      setIsInstalled(installed);
      if (installed) {
        setDeferredPrompt(null);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    mediaQuery.addEventListener('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
    };
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = deferredPrompt;
    if (!promptEvent || isInstalled || isInstallPromptOpen) {
      return;
    }

    setIsInstallPromptOpen(true);

    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;

      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
    } finally {
      setDeferredPrompt(null);
      setIsInstallPromptOpen(false);
    }
  };

  const [syncStatus, setSyncStatus] = useState<SyncStatus>(storage.getStatus());
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(firebaseSync.getCurrentUser());
  const [firebaseStatus, setFirebaseStatus] = useState<FirebaseSyncStatus>(firebaseSync.getStatus());

  useEffect(() => {
    return storage.subscribeStatus((status) => {
      setSyncStatus(status);
    });
  }, []);

  // Live real-time multi-device Firebase sync
  useEffect(() => {
    const unsubAuth = firebaseSync.init((remoteNotes) => {
      if (remoteNotes.length > 0) {
        setNotes((prevNotes) => {
          const map = new Map<string, Note>();
          for (const n of prevNotes) map.set(n.id, n);
          for (const n of remoteNotes) {
            const existing = map.get(n.id);
            if (!existing || (n.updatedAt || 0) >= (existing.updatedAt || 0)) {
              map.set(n.id, n);
              storage.saveLocalOnly(n).catch(() => {});
            }
          }
          return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
        });
      }
    });

    const unsubStatus = firebaseSync.subscribe((status, user) => {
      setFirebaseStatus(status);
      setFirebaseUser(user);
    });

    storage.onNoteSaved((note) => {
      firebaseSync.syncNote(note).catch(() => {});
    });
    storage.onNoteDeleted((id) => {
      firebaseSync.deleteNote(id).catch(() => {});
    });

    return () => {
      unsubAuth();
      unsubStatus();
    };
  }, []);

  useEffect(() => {
    const initLoad = async () => {
      const savedNotes = await storage.getNotes();
      if (savedNotes.length === 0) {
        // Check if server already has notes
        const syncRes = await storage.syncWithServer();
        if (syncRes.syncedNotes && syncRes.syncedNotes.length > 0) {
          setNotes(syncRes.syncedNotes);
          setSelectedId(syncRes.syncedNotes[0].id);
          return;
        }

        const starterNote: Note = {
          id: generateId(),
          title: 'Welcome to Void Notes',
          body: `# Void Notes

A minimalist space for your thoughts with **AMOLED dark mode**, **Multi-Tier Persistence**, and optional **Markdown Preview**.

### Storage & Persistence
- **Dual-Storage Mirror**: Notes are saved simultaneously to IndexedDB and LocalStorage for zero risk of data loss.
- **Backend Sync**: Automatically syncs with persistent server storage whenever connected.
- **Backup & Restore**: Export complete database backups as JSON or restore anytime from the sidebar.

### Features
- [x] Dual local-first persistence (IndexedDB + LocalStorage)
- [x] Cloud/backend auto-sync & conflict reconciliation
- [x] Full JSON backup & restore
- [x] Interactive checklists — tap checkboxes in preview!
- [x] Voice dictation support

> "The void is not empty; it is full of possibilities."

\`\`\`typescript
// Pure local-first simplicity
const note = { amoled: true, markdown: true, persistent: true };
console.log("Welcome to the void.");
\`\`\``,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isPinned: true
        };
        setNotes([starterNote]);
        setSelectedId(starterNote.id);
        storage.saveNote(starterNote);
      } else {
        setNotes(savedNotes);
        const lastId = storage.getLastOpenedId();
        if (lastId && savedNotes.find(n => n.id === lastId)) {
          setSelectedId(lastId);
        } else {
          setSelectedId(savedNotes[0].id);
        }

        // Background server sync to reconcile notes
        storage.syncWithServer(savedNotes).then((res) => {
          if (res.syncedNotes && res.syncedNotes.length > 0) {
            setNotes(res.syncedNotes);
          }
        });
      }
    };
    initLoad();
  }, []);

  useEffect(() => {
    storage.setLastOpenedId(selectedId);
  }, [selectedId]);

  // Handlers
  const handleCreateNote = useCallback(() => {
    const newNote: Note = {
      id: generateId(),
      title: '',
      body: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setNotes(prev => [newNote, ...prev]);
    setSelectedId(newNote.id);
    storage.saveNote(newNote);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  }, []);

  const handleUpdateNote = useCallback((id: string, updates: Partial<Note>) => {
    setNotes(prev => prev.map(note => {
      if (note.id === id) {
        const updatedNote = {
          ...note,
          ...updates,
          updatedAt: Date.now()
        };
        // Auto-generate title if empty and typing body
        if (!updatedNote.title && updatedNote.body && updates.body) {
          const firstLine = updatedNote.body.trim().split('\n')[0].substring(0, 30);
          if (firstLine) updatedNote.title = firstLine;
        }
        storage.saveNote(updatedNote);
        return updatedNote;
      }
      return note;
    }));
  }, []);

  const handleDeleteNote = useCallback((id: string) => {
    setNotes(prev => {
      const remaining = prev.filter(n => n.id !== id);
      if (selectedId === id) {
        setSelectedId(remaining.length > 0 ? remaining[0].id : null);
      }
      return remaining;
    });
    storage.deleteNote(id);
  }, [selectedId]);

  const handleTogglePin = useCallback((id: string) => {
    setNotes(prev => prev.map(n => {
      if (n.id === id) {
        const updated = { ...n, isPinned: !n.isPinned, updatedAt: Date.now() };
        storage.saveNote(updated);
        return updated;
      }
      return n;
    }));
  }, []);

  const handleDuplicate = useCallback((note: Note) => {
    const duplicate: Note = {
      ...note,
      id: generateId(),
      title: `${note.title || 'Untitled'} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPinned: false
    };
    setNotes(prev => [duplicate, ...prev]);
    setSelectedId(duplicate.id);
    storage.saveNote(duplicate);
  }, []);

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';

    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        const newNote: Note = {
          id: generateId(),
          title: file.name.replace(/\.(txt|md|markdown)$/i, ''),
          body: content,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        setNotes(prev => [newNote, ...prev]);
        setSelectedId(newNote.id);
        storage.saveNote(newNote);
      };
      reader.readAsText(file);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleCreateNote();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        // Find focus search
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCreateNote]);

  const handleBackup = useCallback(() => {
    storage.exportAllNotesBackup(notes);
  }, [notes]);

  const handleRestore = useCallback(async (file: File) => {
    const text = await file.text();
    const restored = await storage.restoreNotesFromBackup(text);
    setNotes(restored);
    if (restored.length > 0) {
      setSelectedId(restored[0].id);
    }
  }, []);

  const handleManualSync = useCallback(async () => {
    const res = await storage.syncWithServer(notes);
    if (res.syncedNotes && res.syncedNotes.length > 0) {
      setNotes(res.syncedNotes);
    }
  }, [notes]);

  const handleGoogleLogin = useCallback(async () => {
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
    }
  }, []);

  const handleGoogleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (err: any) {
      console.error('Logout failed:', err);
    }
  }, []);

  const selectedNote = notes.find(n => n.id === selectedId) || null;
  const showInstallBtn = Boolean(deferredPrompt) && !isInstalled;

  const openImportPicker = () => {
    document.getElementById('import-file')?.click();
  };

  const handleImportTriggerKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openImportPicker();
    }
  };

  return (
    <div className="flex h-dvh bg-amoled-black text-text-primary font-sans selection:bg-accent/20">
      <Sidebar
        notes={notes}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNew={handleCreateNote}
        onDelete={handleDeleteNote}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        showInstallBtn={showInstallBtn}
        isInstallDisabled={isInstallPromptOpen}
        onInstall={handleInstallClick}
        isLightMode={isLightMode}
        onToggleTheme={toggleTheme}
        onBackup={handleBackup}
        onRestore={handleRestore}
        onSync={handleManualSync}
        syncStatus={syncStatus}
        firebaseUser={firebaseUser}
        firebaseStatus={firebaseStatus}
        onLogin={handleGoogleLogin}
        onLogout={handleGoogleLogout}
      />

      <Editor
        note={selectedNote}
        onUpdate={handleUpdateNote}
        onDelete={handleDeleteNote}
        onExport={storage.exportNoteAsMd}
        onDuplicate={handleDuplicate}
        onTogglePin={handleTogglePin}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onCreateNote={handleCreateNote}
        isFirebaseSynced={Boolean(firebaseUser && firebaseStatus === 'synced')}
      />

      <input
        type="file"
        id="import-file"
        className="hidden"
        accept=".txt,.md,.markdown"
        onChange={handleImport}
      />

      {showInstallBtn && !isSidebarOpen && (
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={handleInstallClick}
          disabled={isInstallPromptOpen}
          className="fixed bottom-24 right-6 min-h-[52px] min-w-[52px] rounded-full border border-border bg-surface text-accent shadow-lg transition-colors z-10 md:hidden flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-40"
          title="Install App"
          aria-label="Install App"
        >
          <ArrowDownCircle size={24} />
        </motion.button>
      )}

      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        type="button"
        onClick={openImportPicker}
        onKeyDown={handleImportTriggerKeyDown}
        className="fixed bottom-6 right-6 min-h-[52px] min-w-[52px] bg-accent text-amoled-black rounded-full shadow-lg cursor-pointer transition-colors z-10 md:hidden flex items-center justify-center"
        title="Import .txt"
        aria-label="Import .txt"
      >
        <FileUp size={24} />
      </motion.button>
    </div>
  );
}
