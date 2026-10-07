// Promise-based confirm dialog, replacing window.confirm in the notebook.
//
//   const [confirm, confirmEl] = useConfirm()
//   ...
//   if (await confirm({ title: 'Delete note?', message: '…', danger: true })) { … }
//   return <>{confirmEl}</>
//
// The returned element renders the modal (via portal) only while a confirm is
// pending, so it's cheap to leave mounted.

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'

export function useConfirm() {
  const [state, setState] = useState(null)

  // Escape cancels the pending confirm.
  useEffect(() => {
    if (!state) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        state.resolve(false)
        setState(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  const confirm = useCallback(
    (opts = {}) =>
      new Promise((resolve) => {
        setState({
          title: opts.title || 'Are you sure?',
          message: opts.message || '',
          confirmLabel: opts.confirmLabel || 'Confirm',
          cancelLabel: opts.cancelLabel || 'Cancel',
          danger: Boolean(opts.danger),
          resolve,
        })
      }),
    [],
  )

  // Resolve from the current-state closure (not inside a state updater, which
  // must stay pure) then clear the dialog.
  const close = (value) => {
    state?.resolve(value)
    setState(null)
  }

  const confirmEl = state
    ? createPortal(
        <div className="nb-confirm-backdrop" onMouseDown={() => close(false)}>
          <div
            className="nb-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-label={state.title}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {state.danger && (
              <span className="nb-confirm-glyph nb-confirm-glyph-danger">
                <AlertTriangle size={18} />
              </span>
            )}
            <h3 className="nb-confirm-title">{state.title}</h3>
            {state.message && <p className="nb-confirm-message">{state.message}</p>}
            <div className="nb-confirm-actions">
              <button className="nb-confirm-cancel" onClick={() => close(false)} autoFocus>
                {state.cancelLabel}
              </button>
              <button
                className={`nb-confirm-ok${state.danger ? ' is-danger' : ''}`}
                onClick={() => close(true)}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null

  return [confirm, confirmEl]
}

export default useConfirm
