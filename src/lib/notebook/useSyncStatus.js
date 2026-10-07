// React binding for the notebook store's sync status.
//
// Lives beside the store rather than in SyncStatus.jsx so that component file
// exports only a component — a mixed component/hook module breaks fast refresh,
// and the dashboard needs the raw status (for the conflict banner) without
// rendering the pill. Mirrors the shape of lib/useSessionUser.js.

import { useEffect, useState } from 'react'
import { getSyncStatus, subscribeSyncStatus } from './notebookStore.js'

export function useSyncStatus() {
  const [status, setStatus] = useState(getSyncStatus)
  // subscribeSyncStatus calls back immediately with the current value, so the
  // initial getSyncStatus() above is only there to avoid a null first render.
  useEffect(() => subscribeSyncStatus(setStatus), [])
  return status
}
