# Research Notebook

Standalone extraction of the Quantum Codebook notebook (TipTap editor, math, runnable code, circuit blocks, wiki links, backlinks, templates, version history, report mode). No backend: notes live in this browser's localStorage.

    npm install
    npm run dev      # http://localhost:5173
    npm test
    npm run build

## What changed from the original
- `src/lib/auth.js` is a stub (`getUser()` is always null), so the store, assets, versions and retention all stay on their local paths. Replace this file when a backend is added; the Supabase branches in `lib/notebook/*` are still there.
- `src/lib/executeCode.js` runs Python in the browser with Pyodide (loaded from the CDN on first Run). Plain Python and numpy work; Qiskit, Cirq and PennyLane are not available in Pyodide, so the Qiskit templates will not run yet.
- Compiler/Composer links, sign-in prompts and sharing UI were removed or hidden.
- `src/tokens.css` is the design-token layer lifted from the platform's `index.css`.

## Known leftovers
- `NotebookNote.jsx:321` trips the `react-hooks/set-state-in-effect` lint rule (inherited).
- The floating outline panel overlaps the title at narrow widths.
- Sharing and the attachments (lesson/project links) code is present but inert.
