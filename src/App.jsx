import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'

const Notebook = lazy(() => import('./pages/Notebook.jsx'))
const NotebookNote = lazy(() => import('./pages/NotebookNote.jsx'))

export default function App() {
  return (
    <BrowserRouter>
      <header className="app-bar">
        <Link to="/notebook" className="app-bar-brand">Research Notebook</Link>
        <span className="app-bar-note">Local only · saved in this browser</span>
      </header>
      <main className="app-main">
        <Suspense fallback={<p className="app-loading">Loading…</p>}>
          <Routes>
            <Route path="/" element={<Navigate to="/notebook" replace />} />
            <Route path="/notebook" element={<Notebook />} />
            <Route path="/notebook/:id" element={<NotebookNote />} />
            <Route path="*" element={<Navigate to="/notebook" replace />} />
          </Routes>
        </Suspense>
      </main>
    </BrowserRouter>
  )
}
