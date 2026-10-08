// React binding for the backend client's status (see lib/backend.js).
import { useEffect, useState } from 'react'
import { getBackendStatus, subscribeBackend } from './backend.js'

export function useBackendStatus() {
  const [status, setStatus] = useState(getBackendStatus)
  useEffect(() => subscribeBackend(setStatus), [])
  return status
}
