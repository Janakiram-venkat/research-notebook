// Top-bar switch: System → Light → Dark. Shows what is chosen, says what is next.
import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { getThemeChoice, setThemeChoice, THEME_CHOICES } from '../lib/theme.js'

const ICON = { system: Monitor, light: Sun, dark: Moon }
const LABEL = { system: 'Theme: match system', light: 'Theme: light', dark: 'Theme: dark' }

export default function ThemeToggle() {
  const [choice, setChoice] = useState(getThemeChoice)
  // Another tab changed it.
  useEffect(() => {
    const onStorage = (e) => { if (e.key === 'nb.theme') { const c = getThemeChoice(); setChoice(c); setThemeChoice(c) } }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const next = THEME_CHOICES[(THEME_CHOICES.indexOf(choice) + 1) % THEME_CHOICES.length]
  const Icon = ICON[choice]
  return (
    <button
      type="button"
      className="app-bar-icon"
      onClick={() => { setThemeChoice(next); setChoice(next) }}
      title={`${LABEL[choice]} (click for ${next})`}
      aria-label={`${LABEL[choice]}. Switch to ${next}.`}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  )
}
