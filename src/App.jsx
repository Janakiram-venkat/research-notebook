import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { Bot } from 'lucide-react'
import { syncBackend } from './lib/backend.js'
import { applyRemoteNotes, keepBothOnConflict, listNotes } from './lib/notebook/notebookStore.js'
import { toast } from './components/notebook/ui/toast.js'
import AccountMenu from './components/AccountMenu.jsx'
import Tour from './components/Tour.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import './components/agent.css'
import './components/account.css'

const Notebook = lazy(() => import('./pages/Notebook.jsx'))
const NotebookNote = lazy(() => import('./pages/NotebookNote.jsx'))
const NotebookGraph = lazy(() => import('./pages/NotebookGraph.jsx'))
const NotebookReview = lazy(() => import('./pages/NotebookReview.jsx'))
const AgentPanel = lazy(() => import('./components/AgentPanel.jsx'))

export default function App() {
  const [agentOpen, setAgentOpen] = useState(false)
  const [pending, setPending] = useState(null)

  // Presets (note menu, command palette) open the panel and send a prompt.
  useEffect(() => {
    const onAsk = (e) => { setPending(e.detail); setAgentOpen(true) }
    window.addEventListener('nb:agent-ask', onAsk)
    return () => window.removeEventListener('nb:agent-ask', onAsk)
  }, [])

  // Two-way sync with the backend on load. A no-op when it isn't running.
  useEffect(() => {
    const sync = () => syncBackend(listNotes(), applyRemoteNotes, keepBothOnConflict)
    sync()
    // A push the server refused (edited elsewhere): sync now so the conflict is resolved.
    const onConflict = () => sync()
    const onCopies = (e) => toast(
      e.detail.count === 1
        ? 'A note was edited on two devices. The newer version is open; your version was kept as a copy beside it.'
        : `${e.detail.count} notes were edited on two devices. The newer versions are open; yours were kept as copies beside them.`,
      { duration: 12000 },
    )
    window.addEventListener('nb:backend-conflict', onConflict)
    window.addEventListener('nb:conflict-copies', onCopies)
    return () => {
      window.removeEventListener('nb:backend-conflict', onConflict)
      window.removeEventListener('nb:conflict-copies', onCopies)
    }
  }, [])

  return (
    <BrowserRouter>
      <header className="app-bar">
        <Link to="/notebook" className="app-bar-brand">
          <svg className="app-bar-mark" viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="14" fill="#1f2937" />
            <rect x="15" y="12" width="34" height="40" rx="3" fill="#f5f5f0" />
            <rect x="15" y="12" width="7" height="40" rx="3" fill="#4f46e5" />
            <g fill="#a0a5af"><rect x="27" y="22" width="16" height="2.5" /><rect x="27" y="29" width="16" height="2.5" /><rect x="27" y="36" width="12" height="2.5" /></g>
          </svg>
          Research Notebook
        </Link>
        <span className="app-bar-spacer" />
        <AccountMenu />
        <ThemeToggle />
        <button className="app-bar-agent" aria-pressed={agentOpen} onClick={() => setAgentOpen((o) => !o)}>
          <Bot size={15} aria-hidden="true" /> Agents
        </button>
      </header>
      <div className="app-body">
        <main className="app-main">
          <Suspense fallback={<p className="app-loading">Loading…</p>}>
            <Routes>
              <Route path="/" element={<Navigate to="/notebook" replace />} />
              <Route path="/notebook" element={<Notebook />} />
              <Route path="/notebook/graph" element={<NotebookGraph />} />
              <Route path="/notebook/review" element={<NotebookReview />} />
              <Route path="/notebook/:id" element={<NotebookNote />} />
              <Route path="*" element={<Navigate to="/notebook" replace />} />
            </Routes>
          </Suspense>
        </main>
        {agentOpen && (
          <Suspense fallback={null}>
            <AgentPanel onClose={() => setAgentOpen(false)} pending={pending} onPendingHandled={() => setPending(null)} />
          </Suspense>
        )}
      </div>
      <Tour />
    </BrowserRouter>
  )
}
