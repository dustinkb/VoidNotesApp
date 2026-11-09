export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
}

export type NoteUpdate = Partial<Omit<Note, 'id' | 'createdAt'>>;
