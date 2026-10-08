import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './tokens.css'
import './shell.css'
import './theme-dark.css'
import { initTheme } from './lib/theme.js'
import App from './App.jsx'

initTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline support: the service worker caches the app and the Python runtime.
// Production only, so dev reloads are never served stale.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support is optional */ })
  })
}
