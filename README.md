# Research Notebook

A general-purpose, local-first notebook for research and learning: a TipTap editor with math, runnable code, sketches, plots, wiki links, backlinks, templates, version history and a report view. Notes live in this browser's localStorage; an optional FastAPI backend (`backend/`) adds accounts, sync across devices and an AI assistant. Installable as an offline-capable app (PWA).

    npm install
    npm run dev      # http://localhost:5173
    npm test
    npm run build

## Visual notes
- **Mind maps** (`/mind map`, or `/mind map from list` to turn the bullet list above into one): Tab adds a branch, Enter a sibling, type to rename, Space folds, arrows move, Alt+↑/↓ reorders. Saved inside the note; exports, prints and searches as a nested list.
- **Diagrams** (`/diagram`): flowcharts, sequence, timeline, Gantt, pie and more, written in Mermaid with a live preview. Mermaid loads only when a note has a diagram.
- **Knowledge graph** (Graph button, or `/notebook/graph`): every note and `[[link]]`, coloured by folder; hover for neighbours, click to open.
- **Today**: one journal note per day.
- **Export** a mind map or diagram as PNG (2x, for slides and chat) or SVG (vector) from its toolbar. The file matches what is on screen in the current theme.
- **Templates** that start visual: Brainstorm (mind map), Concept map + flashcards, Process / flowchart, Flashcard deck.

## Flashcards
Any line written as `question :: answer` (a list item is fine) becomes a card. **Review** on the notes page shows the cards that are due and schedules each with SM-2 (the algorithm behind Anki): Space reveals, 1–4 grades Again / Hard / Good / Easy. Decks can be filtered by note or tag. Editing an answer keeps a card's progress; editing the question starts it fresh. `::` inside inline code or bold is ignored, as is code such as `std::vector`. Progress is stored in this browser only; it does not sync between devices yet.

## Themes
The sun/moon button in the top bar cycles System → Light → Dark. Sketches and plots keep white paper in dark mode because they are drawn in dark ink.

## Code blocks
- **Python** runs in the browser with Pyodide (loaded from the CDN on first Run). Plain Python and numpy work.
- **JavaScript** runs in a throwaway Web Worker with a 10 s timeout, so it cannot touch the page or your notes. Top-level `await` works.
- `Ctrl+Enter` runs the block; output is saved with the note.

## Templates
Blank, Code scratchpad, Study notes, Experiment log, Reading notes, Decision log, Project plan, Research report. They live in `src/lib/notebook/templates.js`.

## History
- This began as the Quantum Codebook notebook. Circuit blocks and the quantum symbol palette were removed when it was generalised. A saved circuit block now loads as a one-line text note, and old `qiskit` / `cirq` / `pennylane` code blocks load as Python (they could not run in the browser anyway).
- `src/lib/auth.js` is a stub (`getUser()` is always null), so the store, assets, versions and retention all stay on their local paths. Replace this file when a backend is added; the Supabase branches in `lib/notebook/*` are still there.
- `src/tokens.css` is the design-token layer lifted from the platform's `index.css`.
- localStorage keys still use the `qcb.` prefix so existing notes keep loading.

## Running it for other people
    npm run build && cd backend && .venv\Scripts\python -m uvicorn app.main:app --port 8000   # NB_AUTH_MODE=accounts in backend/.env
or `docker compose up` (see `Dockerfile`, `backend/.env.example`). For AWS, follow `docs/DEPLOY_AWS.md` (one server, Docker, HTTPS via Caddy, backups; the AI key can be added later).
Notes can be exported as a Markdown `.zip` and imported from `.md`/`.zip` (Obsidian-style front-matter is read).

## Roadmap: decision agents
Planned for a later stage: agents that help with research and learning decisions, working over the notes the reader already has. Candidates: suggest what to read or revisit next from the link graph and unanswered `[!question]` callouts; draft a decision-log entry from options in a note; quiz from study notes. These need a model backend, so they wait for the `auth.js` / backend step above.

## Known leftovers
- Not yet checked on a real phone: the narrow-width outline sheet and app bar were changed but only desktop was exercised.
- Dead-looking code (`quantumText.js`, `lessons.js`, Supabase branches in `lib/notebook/*`) is still imported; removing it needs care.
- Sharing and the attachments (lesson/project links) code is present but inert.
