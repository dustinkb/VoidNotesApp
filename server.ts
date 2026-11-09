import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

interface ServerNote {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
}

const DATA_DIR = path.resolve(__dirname, 'data');
const NOTES_FILE = path.resolve(DATA_DIR, 'notes.json');
const DELETED_FILE = path.resolve(DATA_DIR, 'deleted_ids.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getStoredNotes(): ServerNote[] {
  try {
    if (!fs.existsSync(NOTES_FILE)) {
      fs.writeFileSync(NOTES_FILE, JSON.stringify([]), 'utf-8');
      return [];
    }
    const raw = fs.readFileSync(NOTES_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read notes file:', err);
    return [];
  }
}

function saveStoredNotes(notes: ServerNote[]): void {
  try {
    const tempFile = `${NOTES_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(notes, null, 2), 'utf-8');
    fs.renameSync(tempFile, NOTES_FILE);
  } catch (err) {
    console.error('Failed to save notes file:', err);
  }
}

function getDeletedIds(): string[] {
  try {
    if (!fs.existsSync(DELETED_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(DELETED_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function addDeletedId(id: string): void {
  try {
    const list = getDeletedIds();
    if (!list.includes(id)) {
      list.push(id);
      fs.writeFileSync(DELETED_FILE, JSON.stringify(list.slice(-500)), 'utf-8');
    }
  } catch (err) {
    console.error('Failed to update deleted IDs:', err);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // API Endpoints
  app.get('/api/health', (_req, res) => {
    const notes = getStoredNotes();
    res.json({
      status: 'ok',
      notesCount: notes.length,
      storageType: 'persistent_filesystem',
      timestamp: Date.now()
    });
  });

  // Get all notes
  app.get('/api/notes', (_req, res) => {
    const notes = getStoredNotes();
    res.json(notes);
  });

  // Upsert a note
  app.post('/api/notes', (req, res) => {
    const note = req.body as ServerNote;
    if (!note || !note.id) {
      res.status(400).json({ error: 'Invalid note payload' });
      return;
    }

    const notes = getStoredNotes();
    const existingIdx = notes.findIndex((n) => n.id === note.id);
    if (existingIdx >= 0) {
      notes[existingIdx] = { ...notes[existingIdx], ...note, updatedAt: note.updatedAt || Date.now() };
    } else {
      notes.unshift(note);
    }

    saveStoredNotes(notes);
    res.json({ success: true, note });
  });

  // Delete note
  app.delete('/api/notes/:id', (req, res) => {
    const { id } = req.params;
    const notes = getStoredNotes();
    const filtered = notes.filter((n) => n.id !== id);
    saveStoredNotes(filtered);
    addDeletedId(id);
    res.json({ success: true, id });
  });

  // Bidirectional sync endpoint
  app.post('/api/notes/sync', (req, res) => {
    const { clientNotes, clientDeletedIds = [] } = req.body as {
      clientNotes?: ServerNote[];
      clientDeletedIds?: string[];
    };

    if (!Array.isArray(clientNotes)) {
      res.status(400).json({ error: 'clientNotes must be an array' });
      return;
    }

    // Merge deleted IDs
    const serverDeletedIds = getDeletedIds();
    const allDeletedIds = Array.from(new Set([...serverDeletedIds, ...clientDeletedIds]));

    // Update server deleted file
    try {
      fs.writeFileSync(DELETED_FILE, JSON.stringify(allDeletedIds.slice(-500)), 'utf-8');
    } catch (e) {
      // Ignore
    }

    const serverNotes = getStoredNotes();
    const noteMap = new Map<string, ServerNote>();

    // Add server notes that aren't deleted
    for (const note of serverNotes) {
      if (!allDeletedIds.includes(note.id)) {
        noteMap.set(note.id, note);
      }
    }

    // Merge client notes
    for (const note of clientNotes) {
      if (allDeletedIds.includes(note.id)) {
        continue;
      }
      const existing = noteMap.get(note.id);
      if (!existing) {
        noteMap.set(note.id, note);
      } else {
        // Take note with highest updatedAt timestamp
        if ((note.updatedAt || 0) >= (existing.updatedAt || 0)) {
          noteMap.set(note.id, { ...existing, ...note });
        }
      }
    }

    const mergedNotes = Array.from(noteMap.values()).sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );

    saveStoredNotes(mergedNotes);

    res.json({
      notes: mergedNotes,
      deletedIds: allDeletedIds,
      syncedAt: Date.now()
    });
  });

  // Full backup endpoint
  app.get('/api/backup', (_req, res) => {
    const notes = getStoredNotes();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="void-notes-backup-${Date.now()}.json"`);
    res.json({
      version: 1,
      source: 'VoidNotes',
      exportedAt: Date.now(),
      notesCount: notes.length,
      notes
    });
  });

  // Full restore endpoint
  app.post('/api/restore', (req, res) => {
    const { notes } = req.body as { notes?: ServerNote[] };
    if (!Array.isArray(notes)) {
      res.status(400).json({ error: 'Invalid backup format' });
      return;
    }

    saveStoredNotes(notes);
    res.json({ success: true, count: notes.length });
  });

  // Vite middleware in dev or static serving in production
  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Void Notes server active at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
