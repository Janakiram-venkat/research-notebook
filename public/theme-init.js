// Runs before the app loads so a dark-mode reader never sees a white flash.
// External (not inline) so the Content-Security-Policy can forbid inline scripts.
try {
  var c = localStorage.getItem('nb.theme')
  var d = c === 'dark' || ((!c || c === 'system') && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = d ? 'dark' : 'light'
  document.documentElement.style.colorScheme = d ? 'dark' : 'light'
} catch { /* storage blocked: the app applies the theme itself on start */ }
