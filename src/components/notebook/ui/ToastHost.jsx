// Renders toasts emitted through ui/toast.js. Mount once per notebook page.

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { subscribeToast } from './toast.js'

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info }

export default function ToastHost() {
  const [items, setItems] = useState([])

  const dismiss = useCallback((id) => {
    setItems((cur) => cur.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    return subscribeToast((t) => {
      // Ids are stable, so a replayed toast (see subscribeToast) can't double up.
      setItems((cur) => (cur.some((x) => x.id === t.id) ? cur : [...cur, t]))
      if (t.duration > 0) {
        window.setTimeout(() => dismiss(t.id), t.duration)
      }
    })
  }, [dismiss])

  if (items.length === 0) return null

  return createPortal(
    <div className="nb-toast-host" role="status" aria-live="polite">
      {items.map((t) => {
        const Icon = ICONS[t.tone] || Info
        return (
          <div key={t.id} className={`nb-toast nb-toast-${t.tone}`}>
            <Icon size={16} className="nb-toast-icon" />
            <span className="nb-toast-msg">{t.message}</span>
            {t.action && (
              <button
                className="nb-toast-action"
                onClick={() => {
                  dismiss(t.id)
                  t.action.run?.()
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="nb-toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
