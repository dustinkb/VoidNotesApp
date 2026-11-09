<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Void Notes

Void Notes is a minimalist, privacy-first note-taking application designed to keep you focused. Everything is stored locally in your browser. No cloud, no tracking, just you and your words.

## Features

- **Local Storage**: All notes are securely saved in your browser.
- **Voice Dictation**: Built-in support for hands-free typing using the Web Speech API.
- **PWA Ready**: Installable as a Progressive Web App (PWA) with full standalone capabilities.
- **Import & Export**: Easily import and export your notes as `.txt` files.
- **Organization**: Pin important notes to the top, duplicate notes, and search through your thoughts.
- **Dark Mode First**: Beautiful, minimalist AMOLED dark-themed interface built with Tailwind CSS.
- **Keyboard Shortcuts**: Built-in shortcuts for rapid interaction (e.g., `Ctrl+N` or `Cmd+N` for a new note).

## Tech Stack

- **Framework**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Animations**: [Framer Motion](https://motion.dev/)
- **Storage**: Local browser storage

## Run Locally

**Prerequisites:** [Node.js](https://nodejs.org/)

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open your browser and navigate to the address provided in your terminal (typically `http://localhost:3000`).

## Environment Variables

If you intend to use the AI capabilities included in the setup, create a `.env.local` or `.env` file in the root directory:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```
