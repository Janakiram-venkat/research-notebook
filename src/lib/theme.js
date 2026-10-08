// Light / dark / follow-the-system theme.
//
// The choice lives in localStorage ('system' by default) and resolves to a
// `data-theme="light|dark"` attribute on <html>, which theme-dark.css keys off.
// index.html applies it before first paint (no white flash in dark mode); this
// module keeps it in step with the system setting and tells listeners (Monaco,
// Mermaid) when it flips.

const KEY = 'nb.theme'
export const THEME_CHOICES = ['system', 'light', 'dark']

const media = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

export function getThemeChoice() {
  try {
    const v = localStorage.getItem(KEY)
    return THEME_CHOICES.includes(v) ? v : 'system'
  } catch {
    return 'system'
  }
}

export function resolveTheme(choice = getThemeChoice()) {
  if (choice === 'light' || choice === 'dark') return choice
  return media?.matches ? 'dark' : 'light'
}

export function getResolvedTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function apply() {
  const resolved = resolveTheme()
  const root = document.documentElement
  if (root.dataset.theme === resolved) return
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
  window.dispatchEvent(new CustomEvent('nb:theme', { detail: { theme: resolved } }))
}

export function setThemeChoice(choice) {
  try { localStorage.setItem(KEY, choice) } catch { /* storage blocked: still applies for this visit */ }
  apply()
}

export function initTheme() {
  apply()
  media?.addEventListener?.('change', () => { if (getThemeChoice() === 'system') apply() })
}

export function onThemeChange(fn) {
  const handler = (e) => fn(e.detail.theme)
  window.addEventListener('nb:theme', handler)
  return () => window.removeEventListener('nb:theme', handler)
}
