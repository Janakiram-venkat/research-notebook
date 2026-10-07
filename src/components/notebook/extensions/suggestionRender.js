// Bridge a TipTap Suggestion plugin to a React dropdown (SuggestionList).
// Mounts the component in a body-level popup positioned at the caret; no tippy
// dependency. Shared by the slash menu and wiki-link autocomplete.

import { ReactRenderer } from '@tiptap/react'

export function createSuggestionRender(Component) {
  return () => {
    let renderer
    let el

    let lastRect = null
    let dismissed = false

    const place = (clientRect) => {
      if (!el) return
      if (clientRect) lastRect = clientRect
      const rect = lastRect?.()
      if (!rect) return
      const margin = 6
      // default: below the caret
      let top = rect.bottom + window.scrollY + margin
      let left = rect.left + window.scrollX
      // flip above if it would overflow the viewport bottom
      const popupH = el.offsetHeight || 0
      if (rect.bottom + popupH + margin > window.innerHeight && rect.top - popupH - margin > 0) {
        top = rect.top + window.scrollY - popupH - margin
      }
      // …and pull back inside the right edge, which used to let the menu hang
      // off-screen on narrow windows.
      const popupW = el.offsetWidth || 0
      const maxLeft = window.scrollX + window.innerWidth - popupW - margin
      left = Math.max(window.scrollX + margin, Math.min(left, maxLeft))
      el.style.top = `${top}px`
      el.style.left = `${left}px`
    }

    // The caret moves with the page, so a popup pinned at absolute coordinates
    // drifts away from it on scroll or resize.
    const reposition = () => place(null)

    return {
      onStart: (props) => {
        dismissed = false
        renderer = new ReactRenderer(Component, { props, editor: props.editor })
        el = document.createElement('div')
        el.className = 'nb-suggest-popup'
        document.body.appendChild(el)
        el.appendChild(renderer.element)
        place(props.clientRect)
        window.addEventListener('scroll', reposition, true)
        window.addEventListener('resize', reposition)
      },
      onUpdate: (props) => {
        if (dismissed) return
        renderer?.updateProps(props)
        place(props.clientRect)
      },
      onKeyDown: (props) => {
        // Returning false here left Escape "unhandled", so the menu stayed open
        // until the query stopped matching. Hide it and swallow the key so it
        // doesn't also bubble out and close something behind the editor.
        if (props.event.key === 'Escape') {
          dismissed = true
          if (el) el.style.display = 'none'
          return true
        }
        return renderer?.ref?.onKeyDown?.(props) ?? false
      },
      onExit: () => {
        window.removeEventListener('scroll', reposition, true)
        window.removeEventListener('resize', reposition)
        el?.remove()
        el = null
        lastRect = null
        renderer?.destroy()
        renderer = null
      },
    }
  }
}
