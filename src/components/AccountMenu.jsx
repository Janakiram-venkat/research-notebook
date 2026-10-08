// App-bar sync status + account control.
//
// One pill answers "where are my notes right now?" in plain words; clicking it opens
// sign-in (when the server wants a login) or the account menu (sign out, delete my
// data, bring-your-own AI key).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Cloud, CloudOff, HardDrive, RefreshCw, TriangleAlert, User, X } from 'lucide-react'
import { deleteRemoteData, getOwnKey, setOwnKey, signIn, signOut, signUp, syncBackend } from '../lib/backend.js'
import { useBackendStatus } from '../lib/useBackendStatus.js'
import { applyRemoteNotes, clearLocalNotes, exportAllNotes, keepBothOnConflict, listNotes } from '../lib/notebook/notebookStore.js'
import { useConfirm } from './notebook/ui/useConfirm.jsx'
import { toastSuccess, toastError } from './notebook/ui/toast.js'
import { downloadJson } from '../lib/notebook/exporters.js'
import './account.css'

const PILL = {
  local: { Icon: HardDrive, label: 'Saved on this device', title: 'Your notes are saved in this browser. No server is connected.' },
  signin: { Icon: CloudOff, label: 'Sign in to sync', title: 'Notes are saved on this device. Sign in to back them up and open them on other devices.' },
  syncing: { Icon: RefreshCw, label: 'Saving…', title: 'Sending your changes to the server.' },
  synced: { Icon: Cloud, label: 'Synced', title: 'Everything is saved on this device and on the server.' },
  offline: { Icon: CloudOff, label: 'Offline: will sync later', title: 'You are offline. Changes are saved on this device and will sync when you reconnect.' },
  error: { Icon: TriangleAlert, label: 'Sync problem', title: 'Your notes are safe on this device. Syncing will retry.' },
  conflict: { Icon: TriangleAlert, label: 'Edited elsewhere', title: 'This note was changed on another device. A copy of the other version was kept.' },
}

export default function AccountMenu() {
  const status = useBackendStatus()
  const [userOpen, setUserOpen] = useState(false)
  const [dismissed, setDismissed] = useState('')
  const [confirm, confirmEl] = useConfirm()
  const pill = PILL[status.state] || PILL.local
  const accounts = status.auth === 'accounts'

  // Open the sign-in dialog by itself when a session ends, until it is dismissed.
  const open = userOpen || (status.state === 'signin' && Boolean(status.message) && dismissed !== status.message)
  const setOpen = (value) => {
    setUserOpen(value)
    if (!value) setDismissed(status.message)
  }

  return (
    <>
      <button
        className={`account-pill is-${status.state}`}
        onClick={() => setOpen(true)}
        title={pill.title}
        aria-label={`${pill.label}. ${accounts ? 'Open account' : 'Open settings'}`}
      >
        <pill.Icon size={14} aria-hidden="true" className={status.state === 'syncing' ? 'spin' : ''} />
        <span>{pill.label}</span>
      </button>
      {open && createPortal(
        <Dialog
          status={status}
          onClose={() => setOpen(false)}
          confirm={confirm}
        />,
        document.body,
      )}
      {confirmEl}
    </>
  )
}

function Dialog({ status, onClose, confirm }) {
  const accounts = status.auth === 'accounts'
  const signedIn = Boolean(status.email)
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState(getOwnKey())

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const action = mode === 'register' ? signUp : signIn
      const { wiped } = await action(email, password, { clearLocal: clearLocalNotes })
      await syncBackend(listNotes(), applyRemoteNotes, keepBothOnConflict)
      toastSuccess(wiped ? 'Signed in. Notes from the previous account were removed from this device.' : 'Signed in. Your notes are syncing.')
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    const remove = await confirm({
      title: 'Sign out',
      message: 'Remove your notes from this device too? They stay safe in your account. Choose this on a shared computer.',
      confirmLabel: 'Sign out and remove',
      cancelLabel: 'Sign out, keep notes here',
    })
    signOut({ removeLocal: remove, clearLocal: clearLocalNotes })
    onClose()
  }

  async function deleteEverything() {
    const ok = await confirm({
      title: accounts && signedIn ? 'Delete my account and all notes?' : 'Delete all notes?',
      message: 'This permanently removes every note from this device' + (signedIn || status.state === 'synced' ? ' and from the server' : '') + '. It cannot be undone. Download a backup first if you might want them.',
      confirmLabel: 'Delete everything',
      danger: true,
    })
    if (!ok) return
    const remoteOk = signedIn || status.state === 'synced' ? await deleteRemoteData({ account: accounts && signedIn }) : true
    clearLocalNotes()
    if (!remoteOk) toastError('Removed from this device, but the server could not be reached. Try again when online.')
    else toastSuccess('All notes deleted.')
    onClose()
  }

  function saveKey() {
    setOwnKey(key)
    toastSuccess(key.trim() ? 'Your API key is saved in this browser.' : 'API key removed.')
  }

  return (
    <div className="account-backdrop" onMouseDown={onClose}>
      <div className="account-dialog" role="dialog" aria-modal="true" aria-label="Account" onMouseDown={(e) => e.stopPropagation()}>
        <button className="account-close" onClick={onClose} aria-label="Close"><X size={16} /></button>

        {accounts && !signedIn ? (
          <form onSubmit={submit} className="account-form">
            <h2>{mode === 'login' ? 'Sign in' : 'Create an account'}</h2>
            <p className="account-lead">
              {status.message || 'Sign in to back up your notes and open them on any device. Your existing notes on this device will be added to your account.'}
            </p>
            <label>Email
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </label>
            <label>Password
              <input
                type="password" required minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {mode === 'register' && <p className="account-hint">At least 8 characters.</p>}
            {error && <p className="account-error" role="alert">{error}</p>}
            <button className="account-primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
            {status.registration && (
              <button type="button" className="account-link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>
                {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
              </button>
            )}
          </form>
        ) : (
          <div className="account-form">
            <h2>{signedIn ? 'Your account' : 'Settings'}</h2>
            {signedIn && <p className="account-lead">Signed in as <strong>{status.email}</strong>.</p>}
            {status.state === 'local' && <p className="account-lead">No server is connected, so notes are saved only in this browser. Download a backup now and then.</p>}

            <div className="account-section">
              <h3>Your data</h3>
              <button className="account-secondary" onClick={() => downloadJson(exportAllNotes(), 'research-notebook')}>Download a backup</button>
              <button className="account-danger" onClick={deleteEverything}>{signedIn ? 'Delete my account and notes' : 'Delete all notes'}</button>
            </div>

            <div className="account-section">
              <h3>AI assistant</h3>
              <p className="account-hint">
                {status.dailyAgentCalls ? `The server includes ${status.dailyAgentCalls} AI requests a day. ` : ''}
                You can use your own Anthropic API key instead. It stays in this browser and is sent only with assistant requests.
                When you use the assistant, the text of your notes it reads is sent to Anthropic.
              </p>
              <input type="password" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" aria-label="Anthropic API key" />
              <button className="account-secondary" onClick={saveKey}>Save key</button>
            </div>

            {signedIn && <button className="account-secondary" onClick={logout}><User size={14} aria-hidden="true" /> Sign out</button>}
          </div>
        )}
      </div>
    </div>
  )
}
