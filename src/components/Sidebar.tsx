import React, { FC, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Pin,
  Trash2,
  X,
  ArrowDownCircle,
  Sun,
  Moon,
  Database,
  RefreshCw,
  Download,
  Upload,
  Check,
  HardDrive
} from 'lucide-react';
import { Note } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { SyncStatus } from '../lib/storage';

interface SidebarProps {
  notes: Note[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  isOpen: boolean;
  onClose: () => void;
  showInstallBtn?: boolean;
  isInstallDisabled?: boolean;
  onInstall?: () => void;
  isLightMode?: boolean;
  onToggleTheme?: () => void;
  onBackup?: () => void;
  onRestore?: (file: File) => Promise<void>;
  onSync?: () => Promise<void>;
  syncStatus?: SyncStatus;
}

const TrashIcon = ({ onClick }: { onClick: (e: React.MouseEvent) => void }) => {
  const [isConfirming, setIsConfirming] = React.useState(false);

  return (
    <motion.button
      whileHover={{ scale: 1.2 }}
      whileTap={{ scale: 0.9 }}
      onClick={(e) => {
        e.stopPropagation();
        if (!isConfirming) {
          setIsConfirming(true);
          setTimeout(() => setIsConfirming(false), 3000);
        } else {
          onClick(e);
          setIsConfirming(false);
        }
      }}
      className={`min-h-[36px] min-w-[36px] transition-all rounded-full flex items-center justify-center ${
        isConfirming
          ? 'text-red-500 bg-red-500/10'
          : 'text-text-secondary opacity-35 md:opacity-0 md:group-hover:opacity-40 hover:opacity-100'
      }`}
      title={isConfirming ? 'Click again to confirm delete' : 'Delete note'}
      aria-label={isConfirming ? 'Confirm delete note' : 'Delete note'}
    >
      {isConfirming ? <X size={14} /> : <Trash2 size={14} />}
    </motion.button>
  );
};

export const Sidebar: FC<SidebarProps> = ({
  notes,
  selectedId,
  onSelect,
  onNew,
  onDelete,
  searchTerm,
  onSearchChange,
  isOpen,
  onClose,
  showInstallBtn,
  isInstallDisabled,
  onInstall,
  isLightMode,
  onToggleTheme,
  onBackup,
  onRestore,
  onSync,
  syncStatus = 'saved'
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [restoreFeedback, setRestoreFeedback] = useState<string | null>(null);

  const filteredNotes = notes
    .filter(
      (n) =>
        n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.body.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.updatedAt - a.updatedAt;
    });

  const handleManualSync = async () => {
    if (!onSync || isSyncing) return;
    setIsSyncing(true);
    try {
      await onSync();
    } finally {
      setTimeout(() => setIsSyncing(false), 500);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onRestore) return;

    try {
      await onRestore(file);
      setRestoreFeedback('Restored successfully');
      setTimeout(() => setRestoreFeedback(null), 3000);
    } catch (err: any) {
      setRestoreFeedback(err.message || 'Restore failed');
      setTimeout(() => setRestoreFeedback(null), 4000);
    }
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 w-80 bg-amoled-black border-r border-border shadow-2xl transition-transform duration-300 ease-out md:relative md:translate-x-0 md:shadow-none flex flex-col h-full ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-6 border-b border-border flex flex-col gap-5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">
                Void Notes
              </h1>
              <span className="opacity-30 text-[9px] font-mono tracking-tighter">
                {notes.length} {notes.length === 1 ? 'note' : 'notes'} • Local-first
              </span>
            </div>

            <div className="flex items-center gap-1">
              {showInstallBtn && (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onInstall}
                  disabled={isInstallDisabled}
                  aria-label="Install App"
                  title="Install App"
                  className="min-h-[40px] min-w-[40px] rounded-full text-accent hover:bg-surface transition-colors flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ArrowDownCircle size={18} />
                </motion.button>
              )}
              {onToggleTheme && (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onToggleTheme}
                  aria-label="Toggle Theme"
                  title="Toggle Theme"
                  className="min-h-[40px] min-w-[40px] rounded-full text-text-secondary hover:text-accent hover:bg-surface transition-colors flex items-center justify-center cursor-pointer"
                >
                  {isLightMode ? <Moon size={18} /> : <Sun size={18} />}
                </motion.button>
              )}
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={onNew}
                aria-label="New Note"
                title="New Note (Ctrl+N)"
                className="min-h-[40px] min-w-[40px] rounded-full text-accent bg-surface hover:bg-neutral-800 transition-colors flex items-center justify-center cursor-pointer"
              >
                <Plus size={18} />
              </motion.button>
              <button
                onClick={onClose}
                className="md:hidden min-h-[40px] min-w-[40px] rounded-full hover:bg-surface transition-colors text-text-secondary flex items-center justify-center"
                aria-label="Close notes list"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="relative group">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary/50"
            />
            <input
              type="text"
              placeholder="Filter notes..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search notes"
              className="w-full bg-surface border border-border rounded-lg py-2 pl-9 pr-3.5 text-xs text-text-primary focus:outline-none focus:border-text-secondary transition-all placeholder:text-text-secondary/40 font-sans"
            />
          </div>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto scrollbar-hide pt-2 pb-4">
          <AnimatePresence initial={false}>
            {filteredNotes.map((note) => (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={`group relative mx-4 my-2 px-5 py-3.5 cursor-pointer rounded-xl transition-all duration-200 ${
                  selectedId === note.id
                    ? 'bg-surface border border-border/60 shadow-sm'
                    : 'hover:bg-surface/40 border border-transparent hover:border-border/30'
                }`}
                onClick={() => {
                  onSelect(note.id);
                  if (window.innerWidth < 768) onClose();
                }}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-2 flex-1 truncate">
                      {note.isPinned && (
                        <Pin
                          size={10}
                          className="text-accent opacity-60 shrink-0"
                          fill="currentColor"
                        />
                      )}
                      <h3
                        className={`text-[14px] font-medium truncate ${
                          selectedId === note.id
                            ? 'text-text-primary font-semibold'
                            : 'text-text-primary/70'
                        }`}
                      >
                        {note.title || 'Untitled Note'}
                      </h3>
                    </div>
                    <TrashIcon onClick={() => onDelete(note.id)} />
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-text-secondary/60 truncate italic font-mono">
                    <span>
                      {new Date(note.updatedAt).toLocaleDateString([], {
                        month: '2-digit',
                        day: '2-digit'
                      })}
                    </span>
                    <span>•</span>
                    <span className="truncate">{note.body || '...'}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredNotes.length === 0 && (
            <div className="px-6 py-16 flex flex-col items-center justify-center text-center opacity-60">
              <p className="text-xs text-text-secondary font-mono tracking-widest uppercase mb-3">
                {searchTerm ? 'No Matches' : 'No Notes Yet'}
              </p>
              <p className="text-[11px] text-text-secondary/60 mb-3">
                {searchTerm
                  ? 'Try a simpler search term.'
                  : 'Create your first note from the + button.'}
              </p>
              <div className="w-8 h-[1px] bg-border mix-blend-screen" />
            </div>
          )}
        </div>

        {/* Persistence & Storage Health Bar */}
        <div className="p-3.5 mx-3 mb-3 rounded-xl border border-border/70 bg-surface/50 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-mono text-text-secondary">
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  syncStatus === 'synced'
                    ? 'bg-emerald-400'
                    : syncStatus === 'saving'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-accent'
                }`}
              />
              <span className="uppercase tracking-wider font-semibold">
                {syncStatus === 'synced'
                  ? 'Synced (Local + Cloud)'
                  : syncStatus === 'saving'
                  ? 'Saving changes...'
                  : syncStatus === 'offline'
                  ? 'Offline (Local Saved)'
                  : 'Multi-Tier Saved'}
              </span>
            </div>

            {onSync && (
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="p-1 rounded text-text-secondary/70 hover:text-text-primary hover:bg-border/40 transition-colors disabled:opacity-40 cursor-pointer"
                title="Sync with backend storage now"
                aria-label="Sync with backend"
              >
                <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
              </button>
            )}
          </div>

          <div className="text-[9px] font-mono text-text-secondary/50 flex items-center gap-1.5">
            <HardDrive size={10} />
            <span>IndexedDB + LocalStorage mirror active</span>
          </div>

          {/* Backup / Restore Controls */}
          <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
            {onBackup && (
              <button
                type="button"
                onClick={onBackup}
                className="flex-1 py-1 px-2 rounded bg-surface hover:bg-border/40 text-[9px] font-mono text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center gap-1 cursor-pointer"
                title="Export complete database backup (.json)"
              >
                <Download size={10} />
                <span>Backup DB</span>
              </button>
            )}

            {onRestore && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-1 px-2 rounded bg-surface hover:bg-border/40 text-[9px] font-mono text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  title="Restore notes from JSON backup"
                >
                  <Upload size={10} />
                  <span>Restore</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleRestoreFile}
                />
              </>
            )}
          </div>

          {restoreFeedback && (
            <div className="text-[9px] font-mono text-accent/80 text-center flex items-center justify-center gap-1 mt-1">
              <Check size={10} />
              <span>{restoreFeedback}</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
