// Side panel for chatting with the backend agents (research, study, decision…).
// Streams the reply as it is written, shows each tool call the agent makes, and
// pulls notes the agent created or changed into the local store when it finishes.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bot, Send, Square, X, Wrench, TriangleAlert } from 'lucide-react'
import MarkdownView from './notebook/MarkdownView.jsx'
import { backendUp, chatWithAgent, listAgents, syncBackend } from '../lib/backend.js'
import { useBackendStatus } from '../lib/useBackendStatus.js'
import { applyRemoteNotes, keepBothOnConflict, listNotes } from '../lib/notebook/notebookStore.js'

const TOOL_LABELS = {
  list_notes: 'Listing notes',
  search_notes: 'Searching notes',
  read_note: 'Reading a note',
  find_related: 'Finding connections',
  create_note: 'Creating a note',
  append_to_note: 'Adding to a note',
}

function toolLine(step) {
  const label = TOOL_LABELS[step.name] || step.name
  const arg = step.input?.query || step.input?.title || ''
  return arg ? `${label}: ${arg}` : label
}

export default function AgentPanel({ onClose, pending, onPendingHandled }) {
  const backend = useBackendStatus()
  const location = useLocation()
  const openNoteId = location.pathname.match(/^\/notebook\/([^/]+)$/)?.[1] || null

  const [agents, setAgents] = useState(null) // null = loading, [] = backend offline
  const [agentKey, setAgentKey] = useState('assistant')
  const [turns, setTurns] = useState([]) // { role, text, steps[], error }
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const abortRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    backendUp().then((up) => (up ? listAgents() : null)).then((list) => {
      if (!cancelled) setAgents(list || [])
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [turns])

  const patchLast = useCallback((fn) => {
    setTurns((all) => all.map((t, i) => (i === all.length - 1 ? fn(t) : t)))
  }, [])

  async function send(override, agentOverride) {
    const text = (typeof override === 'string' ? override : draft).trim()
    if (!text || busy) return
    const useAgent = agentOverride || agentKey
    setAgentKey(useAgent)
    setDraft('')
    const history = [...turns.filter((t) => t.text), { role: 'user', text }]
    setTurns([...turns, { role: 'user', text }, { role: 'assistant', text: '', steps: [] }])
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller
    const changedIds = new Set()

    try {
      await chatWithAgent(
        useAgent,
        history.map((t) => ({ role: t.role, content: t.text })),
        {
          focusNoteId: openNoteId,
          signal: controller.signal,
          onEvent: (e) => {
            if (e.type === 'text') patchLast((t) => ({ ...t, text: t.text + e.text }))
            else if (e.type === 'tool_use') patchLast((t) => ({ ...t, steps: [...t.steps, { id: e.id, name: e.name, input: e.input }] }))
            else if (e.type === 'tool_result') {
              e.changed.forEach((id) => changedIds.add(id))
              patchLast((t) => ({ ...t, steps: t.steps.map((s) => (s.id === e.id ? { ...s, ok: e.ok, summary: e.summary } : s)) }))
            } else if (e.type === 'error') patchLast((t) => ({ ...t, error: e.message }))
          },
        },
      )
    } catch (err) {
      if (err?.name !== 'AbortError') patchLast((t) => ({ ...t, error: 'Lost the connection to the backend.' }))
    } finally {
      setBusy(false)
      abortRef.current = null
      if (changedIds.size > 0) {
        await syncBackend(listNotes(), applyRemoteNotes, keepBothOnConflict)
        // applyRemoteNotes() fires nb:notes-changed; the open note reloads itself.
      }
    }
  }

  // A preset from the note menu: switch agent and send once the agent list has loaded.
  useEffect(() => {
    if (!pending || agents === null || busy) return
    if (agents.length === 0) { onPendingHandled?.(); return }
    onPendingHandled?.()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- acting on a request that arrived as a prop
    send(pending.prompt, agents.some((a) => a.key === pending.agent) ? pending.agent : undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per preset
  }, [pending, agents])

  return (
    <aside className="agent-panel" aria-label="Agents">
      <header className="agent-head">
        <Bot size={16} aria-hidden="true" />
        <select
          className="agent-select"
          value={agentKey}
          onChange={(e) => setAgentKey(e.target.value)}
          disabled={busy || !agents?.length}
          aria-label="Agent"
        >
          {(agents?.length ? agents : [{ key: 'assistant', name: 'Notebook assistant' }]).map((a) => (
            <option key={a.key} value={a.key}>{a.name}</option>
          ))}
        </select>
        <button className="agent-icon-btn" onClick={onClose} aria-label="Close agents"><X size={16} /></button>
      </header>

      {agents && agents.length === 0 ? (
        <div className="agent-empty">
          <TriangleAlert size={18} aria-hidden="true" />
          {backend.state === 'signin' ? (
            <p>Sign in (top right) to use the assistant. It works over the notes in your account.</p>
          ) : (
            <p>The assistant is not available right now. Your notes are still saved here and everything else works.</p>
          )}
          {import.meta.env.DEV && backend.state === 'local' && (
            <code>cd backend && .venv\Scripts\python -m uvicorn app.main:app --port 8000</code>
          )}
        </div>
      ) : (
        <>
          <div className="agent-log">
            {turns.length === 0 && agents && (
              <p className="agent-hint">
                {agents.find((a) => a.key === agentKey)?.description}
                {openNoteId ? ' It can see which note you have open.' : ''}
              </p>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`agent-turn agent-turn-${t.role}`}>
                {t.steps?.map((s) => (
                  <div key={s.id} className={`agent-step${s.ok === false ? ' is-failed' : ''}`}>
                    <Wrench size={12} aria-hidden="true" />
                    <span>{toolLine(s)}</span>
                    {s.summary && <em>{s.summary}</em>}
                  </div>
                ))}
                {t.role === 'assistant' ? (t.text ? <MarkdownView markdown={t.text} /> : null) : <p>{t.text}</p>}
                {t.error && <p className="agent-error">{t.error}</p>}
              </div>
            ))}
            {busy && <p className="agent-working">Working…</p>}
            <div ref={bottomRef} />
          </div>

          <form className="agent-compose" onSubmit={(e) => { e.preventDefault(); send() }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Ask about your notes…"
              rows={2}
              aria-label="Message"
            />
            {busy ? (
              <button type="button" className="agent-send" onClick={() => abortRef.current?.abort()} aria-label="Stop">
                <Square size={15} />
              </button>
            ) : (
              <button type="submit" className="agent-send" disabled={!draft.trim()} aria-label="Send">
                <Send size={15} />
              </button>
            )}
          </form>
        </>
      )}
    </aside>
  )
}
