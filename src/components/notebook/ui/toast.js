// Tiny module-level toast bus for the notebook.
//
// Deep components (TextBlock, CodeBlock) can fire a toast without prop-drilling
// a handler down through the block model — they just call `toast(...)`. A single
// <ToastHost/> mounted on each notebook page renders whatever is emitted.

let listeners = new Set()
let seq = 0

// Some toasts are emitted as their page navigates away ("Deleted … / Undo"),
// so the host that receives them unmounts an instant later and the message is
// never seen. Keep very recent toasts around and replay them to a host that
// mounts right after — long enough to survive a route change, short enough that
// it can't resurrect a stale message on a later mount.
const HANDOFF_MS = 1200
let recent = []

function remember(item) {
  const now = Date.now()
  recent = recent.filter((r) => now - r.at < HANDOFF_MS)
  recent.push({ at: now, item })
}

// tone: 'info' | 'success' | 'error'. duration 0 = sticky (dismiss manually).
// action: optional { label, run } rendered as a button — the toast is how we
// offer "Undo" on destructive actions, so the undo window lives where the user
// is already looking instead of behind a confirm dialog they've dismissed.
export function toast(message, { tone = 'info', duration = 3400, action = null } = {}) {
  const item = { id: ++seq, message, tone, duration, action }
  remember(item)
  listeners.forEach((fn) => fn(item))
  return item.id
}

export const toastSuccess = (m, o) => toast(m, { ...o, tone: 'success' })
export const toastError = (m, o) => toast(m, { ...o, tone: 'error', duration: 5200 })

// A host mounting into an in-flight page transition picks up whatever was just
// emitted. Ids are stable, so a host that somehow sees a toast twice de-dupes it.
export function subscribeToast(fn) {
  const hadListener = listeners.size > 0
  listeners.add(fn)
  if (!hadListener) {
    const now = Date.now()
    for (const r of recent) if (now - r.at < HANDOFF_MS) fn(r.item)
  }
  return () => listeners.delete(fn)
}
