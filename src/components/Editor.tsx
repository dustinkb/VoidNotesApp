import React, { FC, useEffect, useRef, useState, useCallback } from 'react';
import { Note } from '../types';
import {
  Trash2,
  Download,
  Copy,
  Pin,
  Menu,
  FileUp,
  FileText,
  X,
  Hash,
  Type,
  Info,
  Mic,
  MicOff,
  AlertCircle,
  Eye,
  Edit3,
  Columns2,
  Bold,
  Italic,
  List,
  CheckSquare,
  Code as CodeIcon,
  Heading2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDictation } from '../lib/useDictation';
import { MarkdownRenderer } from './MarkdownRenderer';
import { storage, SyncStatus } from '../lib/storage';

export type ViewMode = 'raw' | 'preview' | 'split';

interface EditorProps {
  note: Note | null;
  onUpdate: (id: string, updates: Partial<Note>) => void;
  onDelete: (id: string) => void;
  onExport: (note: Note) => void;
  onDuplicate: (note: Note) => void;
  onTogglePin: (id: string) => void;
  toggleSidebar: () => void;
  onCreateNote: () => void;
}

export const Editor: FC<EditorProps> = ({
  note,
  onUpdate,
  onDelete,
  onExport,
  onDuplicate,
  onTogglePin,
  toggleSidebar,
  onCreateNote
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const shouldStartDictationRef = useRef(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(storage.getStatus());
  const [statusMessage, setStatusMessage] = useState<string>('');

  useEffect(() => {
    return storage.subscribeStatus((status, message) => {
      setSyncStatus(status);
      if (message) setStatusMessage(message);
    });
  }, []);

  // View mode state: raw | preview | split (persisted in localStorage)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('voidnotes_view_mode');
    if (saved === 'raw' || saved === 'preview' || saved === 'split') {
      return saved;
    }
    return 'raw';
  });

  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('voidnotes_view_mode', mode);
    if (mode === 'raw') {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  };

  const noteRef = useRef(note);
  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  const { isSupported, isListening, interimText, error, start, stop, toggle } = useDictation({
    onFinalTranscript: (text) => {
      const currentNote = noteRef.current;
      if (currentNote) {
        const separator = currentNote.body.trim().length > 0 ? ' ' : '';
        onUpdate(currentNote.id, {
          body: `${currentNote.body}${separator}${text}`
        });
      }
    }
  });

  const handleMicClick = () => {
    if (!noteRef.current) {
      shouldStartDictationRef.current = true;
      onCreateNote();
    } else {
      toggle();
    }
  };

  useEffect(() => {
    if (textareaRef.current && (viewMode === 'raw' || viewMode === 'split')) {
      if (window.innerWidth >= 768) {
        textareaRef.current.focus();
      }
    }
  }, [note?.id, viewMode]);

  useEffect(() => {
    if (note?.id && shouldStartDictationRef.current) {
      shouldStartDictationRef.current = false;
      start();
    }
  }, [note?.id, start]);

  // Keyboard shortcut for toggling view modes (Ctrl+P / Cmd+P or Ctrl+M / Cmd+M)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle preview with Ctrl+P / Cmd+P or Ctrl+M / Cmd+M
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P' || e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        setViewMode((current) => {
          const next: ViewMode = current === 'raw' ? 'preview' : 'raw';
          localStorage.setItem('voidnotes_view_mode', next);
          if (next === 'raw') {
            setTimeout(() => textareaRef.current?.focus(), 50);
          }
          return next;
        });
      }

      // Switch to raw edit mode with Ctrl+E / Cmd+E
      if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        setViewMode('raw');
        localStorage.setItem('voidnotes_view_mode', 'raw');
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const openImportPicker = () => {
    document.getElementById('import-file')?.click();
  };

  // Interactive task list toggling directly from Markdown preview
  const handleToggleTask = useCallback((taskIndex: number) => {
    const currentNote = noteRef.current;
    if (!currentNote) return;

    let currentIndex = 0;
    const updatedBody = currentNote.body.replace(
      /^(\s*[-*+]\s+\[)([ xX])(\]\s+)/gm,
      (match, prefix, check, suffix) => {
        if (currentIndex === taskIndex) {
          currentIndex++;
          const isChecked = check.toLowerCase() === 'x';
          return `${prefix}${isChecked ? ' ' : 'x'}${suffix}`;
        }
        currentIndex++;
        return match;
      }
    );

    onUpdate(currentNote.id, { body: updatedBody });
  }, [onUpdate]);

  // Helper function to insert markdown formatting syntax in raw mode
  const insertFormatting = (before: string, after: string = '', defaultText: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea || !note) return;
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const selected = note.body.substring(startPos, endPos) || defaultText;
    const replacement = `${before}${selected}${after}`;
    const newBody =
      note.body.substring(0, startPos) + replacement + note.body.substring(endPos);

    onUpdate(note.id, { body: newBody });
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        startPos + before.length,
        startPos + before.length + selected.length
      );
    }, 0);
  };

  if (!note) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center bg-amoled-black text-text-secondary p-8 text-center"
        style={{ backgroundColor: 'var(--color-amoled-black)' }}
      >
        <div className="relative mb-6 flex items-center justify-center">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onCreateNote}
            className="w-20 h-20 rounded-2xl border border-border/50 bg-surface/30 flex items-center justify-center transition-all z-10"
            title="Create Note"
            aria-label="Create note"
          >
            <FileText size={32} className="opacity-20" />
          </motion.button>

          {isSupported && (
            <motion.button
              whileHover={{ scale: 1.1, x: 20 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleMicClick}
              className={`absolute left-full ml-4 min-h-[44px] min-w-[44px] rounded-full border transition-all flex items-center justify-center ${
                isListening
                  ? 'border-red-500/50 bg-red-500/10 text-red-500'
                  : 'border-border/50 bg-surface/30 text-text-secondary hover:text-text-primary'
              }`}
              title={isListening ? 'Listening...' : 'Dictate Note'}
              aria-label={isListening ? 'Stop dictation' : 'Start dictation'}
            >
              <Mic size={20} className={isListening ? 'animate-pulse' : ''} />
            </motion.button>
          )}
        </div>
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-40">
          Select, create, or dictate
        </p>
        {error && (
          <p className="font-mono text-[9px] text-red-500/70 mt-4 uppercase flex items-center gap-1">
            <AlertCircle size={10} /> {error}
          </p>
        )}
      </div>
    );
  }

  const wordCount = note.body.trim() ? note.body.trim().split(/\s+/).length : 0;
  const charCount = note.body.length;

  return (
    <div className="flex-1 flex flex-col h-full bg-amoled-black p-4 md:px-[60px] md:py-[36px] overflow-hidden">
      {/* Sidebar Toggle for Mobile */}
      <div className="flex md:hidden items-center justify-between mb-4">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={toggleSidebar}
          className="min-h-[44px] min-w-[44px] -ml-2 text-text-secondary flex items-center justify-center"
          aria-label="Open notes list"
        >
          <Menu size={20} />
        </motion.button>

        {/* Mobile View Mode Segmented Control */}
        <div className="flex items-center p-0.5 rounded-lg border border-border bg-surface/60 text-[11px] font-mono">
          <button
            type="button"
            onClick={() => handleSetViewMode('raw')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
              viewMode === 'raw'
                ? 'bg-accent text-amoled-black font-semibold shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
            title="Raw Markdown"
            aria-label="Raw Markdown"
          >
            <Edit3 size={13} />
            <span>Raw</span>
          </button>
          <button
            type="button"
            onClick={() => handleSetViewMode('preview')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
              viewMode === 'preview'
                ? 'bg-accent text-amoled-black font-semibold shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
            title="Rendered Preview"
            aria-label="Rendered Preview"
          >
            <Eye size={13} />
            <span>Preview</span>
          </button>
        </div>

        <div className="w-1 h-1 rounded-full bg-accent animate-pulse" />
      </div>

      {/* Main Toolbar */}
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
        {/* Left: View Mode Segmented Control (Raw / Preview / Split) */}
        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center p-0.5 rounded-lg border border-border bg-surface/60 text-[11px] font-mono">
            <button
              type="button"
              onClick={() => handleSetViewMode('raw')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'raw'
                  ? 'bg-accent text-amoled-black font-semibold shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title="Raw Markdown Text (Ctrl+E)"
              aria-label="Raw Markdown Text"
            >
              <Edit3 size={13} />
              <span>Raw</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetViewMode('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'preview'
                  ? 'bg-accent text-amoled-black font-semibold shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title="Rendered Markdown Preview (Ctrl+P)"
              aria-label="Rendered Markdown Preview"
            >
              <Eye size={13} />
              <span>Preview</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetViewMode('split')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'split'
                  ? 'bg-accent text-amoled-black font-semibold shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title="Side-by-side Split View"
              aria-label="Side-by-side Split View"
            >
              <Columns2 size={13} />
              <span>Split</span>
            </button>
          </div>

          {/* Quick Markdown formatting toolbar when in Raw or Split mode */}
          {(viewMode === 'raw' || viewMode === 'split') && (
            <div className="hidden xl:flex items-center gap-1 px-2 py-1 rounded-lg border border-border/40 bg-surface/30 text-text-secondary">
              <button
                type="button"
                onClick={() => insertFormatting('## ', '', 'Heading')}
                className="p-1 rounded hover:text-text-primary hover:bg-border/40 transition-colors"
                title="Heading 2"
                aria-label="Heading 2"
              >
                <Heading2 size={14} />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('**', '**', 'bold')}
                className="p-1 rounded hover:text-text-primary hover:bg-border/40 transition-colors"
                title="Bold"
                aria-label="Bold"
              >
                <Bold size={14} />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('*', '*', 'italic')}
                className="p-1 rounded hover:text-text-primary hover:bg-border/40 transition-colors"
                title="Italic"
                aria-label="Italic"
              >
                <Italic size={14} />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('- ', '', 'list item')}
                className="p-1 rounded hover:text-text-primary hover:bg-border/40 transition-colors"
                title="Bullet List"
                aria-label="Bullet List"
              >
                <List size={14} />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('- [ ] ', '', 'task')}
                className="p-1 rounded hover:text-text-primary hover:bg-border/40 transition-colors"
                title="Task Checklist"
                aria-label="Task Checklist"
              >
                <CheckSquare size={14} />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('```\n', '\n```', 'code')}
                className="p-1 rounded hover:text-text-primary hover:bg-border/40 transition-colors"
                title="Code Block"
                aria-label="Code Block"
              >
                <CodeIcon size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 md:gap-3 ml-auto">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            type="button"
            onClick={openImportPicker}
            className="min-h-[38px] min-w-[38px] rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-all cursor-pointer flex items-center justify-center"
            title="Import .txt or .md"
            aria-label="Import note"
          >
            <FileUp size={18} />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onExport(note)}
            className="min-h-[38px] min-w-[38px] rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-all flex items-center justify-center"
            title="Export"
            aria-label="Export"
          >
            <Download size={18} />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onDuplicate(note)}
            className="min-h-[38px] min-w-[38px] rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-all flex items-center justify-center"
            title="Duplicate"
            aria-label="Duplicate"
          >
            <Copy size={18} />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onTogglePin(note.id)}
            className={`min-h-[38px] min-w-[38px] rounded-lg transition-all flex items-center justify-center ${
              note.isPinned
                ? 'text-accent bg-surface'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface'
            }`}
            title={note.isPinned ? 'Unpin' : 'Pin'}
            aria-label={note.isPinned ? 'Unpin' : 'Pin'}
          >
            <Pin size={18} fill={note.isPinned ? 'currentColor' : 'none'} />
          </motion.button>

          <div className="w-[1px] h-4 bg-border mx-0.5" />

          {isSupported && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleMicClick}
              className={`min-h-[40px] min-w-[40px] rounded-lg transition-all flex items-center justify-center ${
                isListening
                  ? 'text-red-500 bg-red-500/10 hover:bg-red-500/20'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface'
              }`}
              title={isListening ? 'Stop Dictation' : 'Dictate'}
              aria-label={isListening ? 'Stop Dictation' : 'Dictate'}
            >
              {isListening ? <Mic size={18} className="animate-pulse" /> : <MicOff size={18} />}
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              if (!isDeleting) {
                setIsDeleting(true);
                setTimeout(() => setIsDeleting(false), 3000);
              } else {
                onDelete(note.id);
                setIsDeleting(false);
              }
            }}
            className={`min-h-[38px] min-w-[38px] rounded-lg transition-all flex items-center justify-center ${
              isDeleting
                ? 'text-red-500 bg-red-500/20'
                : 'text-red-500/60 hover:text-red-500 hover:bg-red-500/10'
            }`}
            title={isDeleting ? 'Confirm Delete' : 'Delete'}
            aria-label={isDeleting ? 'Confirm delete note' : 'Delete note'}
          >
            {isDeleting ? <X size={18} /> : <Trash2 size={18} />}
          </motion.button>

          <button
            type="button"
            onClick={() => storage.syncWithServer().catch(() => {})}
            className="min-h-[36px] rounded-lg border border-border px-3 flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.16em] text-text-secondary/80 hover:text-text-primary hover:border-text-secondary/40 transition-all cursor-pointer"
            aria-label="Storage status"
            title={`${statusMessage || 'IndexedDB + LocalStorage mirror + Cloud backend'}. Click to sync now.`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                syncStatus === 'synced'
                  ? 'bg-emerald-400'
                  : syncStatus === 'saving'
                  ? 'bg-amber-400 animate-pulse'
                  : syncStatus === 'offline'
                  ? 'bg-text-secondary/50'
                  : 'bg-accent'
              }`}
            />
            <span>
              {syncStatus === 'saving'
                ? 'Saving'
                : syncStatus === 'synced'
                ? 'Synced'
                : syncStatus === 'offline'
                ? 'Offline'
                : 'Saved'}
            </span>
          </button>
        </div>
      </header>

      {/* Meta Data */}
      <div className="flex items-center gap-2 text-[9px] font-mono text-text-secondary/40 mb-4 uppercase tracking-tighter">
        <Info size={10} />
        <span>{new Date(note.createdAt).toLocaleDateString()}</span>
        <span>•</span>
        <span>
          {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span>•</span>
        <span className="text-text-secondary/60">
          {viewMode === 'preview' ? 'Markdown Preview' : viewMode === 'split' ? 'Split View' : 'Raw Text'}
        </span>
      </div>

      {/* Title Input */}
      <input
        type="text"
        value={note.title}
        onChange={(e) => onUpdate(note.id, { title: e.target.value })}
        placeholder="New Title"
        className="bg-transparent text-2xl md:text-3xl font-bold text-text-primary focus:outline-none placeholder:text-text-secondary/15 mb-6"
      />

      {/* Editor Content Based on View Mode */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Raw View Mode */}
        {viewMode === 'raw' && (
          <textarea
            ref={textareaRef}
            value={note.body}
            onChange={(e) => onUpdate(note.id, { body: e.target.value })}
            placeholder="Begin typing Markdown (e.g. # Heading, **bold**, - [ ] task)..."
            className="flex-1 w-full bg-transparent text-[17px] leading-[1.65] text-text-primary resize-none focus:outline-none placeholder:text-text-secondary/20 font-sans"
            spellCheck={false}
          />
        )}

        {/* Preview View Mode */}
        {viewMode === 'preview' && (
          <div className="flex-1 overflow-y-auto pr-2 pb-8">
            <MarkdownRenderer
              content={note.body}
              onToggleTask={handleToggleTask}
              onSwitchToEdit={() => handleSetViewMode('raw')}
            />
          </div>
        )}

        {/* Split View Mode (Side-by-side editing and preview) */}
        {viewMode === 'split' && (
          <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden min-h-0">
            {/* Left: Raw Editor */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden pr-0 md:pr-4 md:border-r md:border-border/60">
              <div className="text-[10px] font-mono uppercase tracking-widest text-text-secondary/40 mb-2 flex items-center gap-1.5 select-none">
                <Edit3 size={11} />
                <span>Raw Markdown</span>
              </div>
              <textarea
                ref={textareaRef}
                value={note.body}
                onChange={(e) => onUpdate(note.id, { body: e.target.value })}
                placeholder="Begin typing Markdown..."
                className="flex-1 w-full bg-transparent text-[16px] leading-[1.6] text-text-primary resize-none focus:outline-none placeholder:text-text-secondary/20 font-sans"
                spellCheck={false}
              />
            </div>

            {/* Right: Rendered Preview */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden pl-0 md:pl-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-text-secondary/40 mb-2 flex items-center gap-1.5 select-none">
                <Eye size={11} />
                <span>Rendered Preview</span>
              </div>
              <div className="flex-1 overflow-y-auto pr-2 pb-8">
                <MarkdownRenderer
                  content={note.body}
                  onToggleTask={handleToggleTask}
                  onSwitchToEdit={() => handleSetViewMode('raw')}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Interim Dictation Overlay */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-4 p-4 border border-red-500/20 bg-red-500/5 rounded-xl flex flex-col gap-2 relative overflow-hidden shrink-0"
          >
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent animate-pulse" />
            <div className="flex items-center gap-2 text-red-500/80 mb-1">
              <Mic size={12} className="animate-pulse" />
              <span className="text-[9px] font-mono tracking-widest uppercase">Listening</span>
              <button
                type="button"
                onClick={stop}
                className="ml-auto min-h-[32px] px-2 rounded-md text-[9px] font-mono tracking-widest uppercase text-red-400/80 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                aria-label="Stop dictation"
              >
                Stop
              </button>
            </div>
            <p className="text-[16px] text-text-primary italic opacity-70 min-h-[1.5em]">
              {interimText || 'Waiting for speech...'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Bar */}
      <footer className="mt-6 pt-4 border-t border-border flex justify-between items-center text-[10px] font-mono text-text-secondary/40 select-none shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Hash size={12} className="opacity-50" />
            <span>{wordCount} words</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Type size={12} className="opacity-50" />
            <span>{charCount} chars</span>
          </div>
          <button
            type="button"
            onClick={() => handleSetViewMode(viewMode === 'raw' ? 'preview' : 'raw')}
            className="hidden sm:flex items-center gap-1 hover:text-text-primary transition-colors cursor-pointer text-text-secondary/60"
            title="Toggle between Raw and Preview (Ctrl+P)"
          >
            {viewMode === 'preview' ? <Eye size={11} /> : <Edit3 size={11} />}
            <span className="uppercase">{viewMode} mode</span>
            <span className="text-[9px] opacity-40 ml-0.5">(Ctrl+P)</span>
          </button>
          {error && (
            <div className="flex items-center gap-1 text-red-500/70 ml-2 uppercase">
              <AlertCircle size={10} />
              <span>{error}</span>
            </div>
          )}
        </div>
        <motion.div
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="flex items-center gap-2"
        >
          <div className="w-1 h-1 rounded-full bg-accent" />
          <span className="tracking-[0.3em]">VOID</span>
        </motion.div>
      </footer>
    </div>
  );
};
