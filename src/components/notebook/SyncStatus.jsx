// Sync indicator for the notebook.
//
// The editor already reported a local save state ("Saving…" / "Saved"), but
// "Saved" meant only "written to this browser" — which is the one thing the
// user never doubted. What they cannot see, and what actually matters when two
// devices are involved, is whether the server has the edit. This component
// reports that half, and the note page renders it beside the local state so the
// two are never conflated.
//
// Deliberately quiet: `synced` is the resting state for a signed-in user and
// should not draw the eye. Only `conflict` and `error` are coloured.

import { Cloud, CloudOff, CloudUpload, RefreshCw, TriangleAlert, HardDrive } from 'lucide-react'
import { useSyncStatus } from '../../lib/notebook/useSyncStatus.js'

// One row per state so the label, icon and tone can't drift apart.
// One row per state so the label, icon and tone can't drift apart.
//
// The labels are the user's question answered, not the system's state named:
// what someone wants from this pill is "where is my work right now", and
// "Pending" / "Synced" / "Local only" answer a question about the queue
// instead. Every label here therefore says where the note is, and every
// tooltip says what happens next.
const PRESENTATION = {
  signedOut: {
    Icon: HardDrive,
    label: 'Saved on this device',
    title: 'Your notes are saved in this browser only. Sign in to save them to the cloud and read them on other devices.',
    tone: 'muted',
  },
  offline: {
    Icon: CloudOff,
    label: 'Waiting to sync',
    title: "You're offline. Your changes are saved on this device and will go to the cloud when the connection returns.",
    tone: 'muted',
  },
  pending: {
    Icon: CloudUpload,
    label: 'Waiting to sync',
    title: 'Saved on this device. Sending to the cloud shortly.',
    tone: 'muted',
  },
  syncing: {
    Icon: RefreshCw,
    label: 'Saving to cloud…',
    title: 'Sending your changes to the cloud.',
    tone: 'busy',
  },
  synced: {
    Icon: Cloud,
    label: 'Saved to cloud',
    title: 'Everything on this device has reached the cloud.',
    tone: 'ok',
  },
  conflict: {
    Icon: TriangleAlert,
    label: 'Two versions kept',
    title: 'This note was edited on another device at the same time. Both versions were kept, so nothing was lost.',
    tone: 'warn',
  },
  error: {
    Icon: CloudOff,
    label: 'Sync failed',
    title: 'Sync failed. Your changes are still saved on this device, and syncing will be retried.',
    tone: 'danger',
  },
}

export default function SyncStatus({ compact = false }) {
  const status = useSyncStatus()
  const view = PRESENTATION[status.state] || PRESENTATION.synced
  const { Icon } = view

  // Surface the queue depth only when there's something to report — the label
  // alone reads as a stuck state, "Waiting to sync · 3" reads as work in
  // progress.
  const outstanding = (status.pending || 0) + (status.pendingDeletes || 0)
  const label = status.state === 'pending' && outstanding > 1 ? `${view.label} · ${outstanding}` : view.label

  return (
    <span
      className={`nb-sync-pill nb-sync-${view.tone}${compact ? ' is-compact' : ''}`}
      title={view.title}
      role="status"
      aria-live="polite"
    >
      <Icon size={13} className={status.state === 'syncing' ? 'nb-sync-spin' : undefined} aria-hidden="true" />
      {/* Compact mode drops the text, so the state has to reach a screen
          reader some other way — the icon alone is aria-hidden. */}
      {compact ? <span className="sr-only">{`Sync status: ${label}`}</span> : <span className="nb-sync-label">{label}</span>}
    </span>
  )
}
