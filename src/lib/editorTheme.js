import { useCallback } from 'react'

/**
 * Monaco theming.
 *
 * Monaco paints itself outside the CSS cascade — it takes a theme object of
 * literal colours, so it cannot consume `var(--syn-keyword)` the way the rest
 * of the app does. The three editors (the compiler, notebook code blocks, and
 * the guided project track) used to pass the stock `theme="vs-dark"`, which
 * meant the code editor was the one surface in the product that ignored the
 * palette entirely and stayed dark on a light page.
 *
 * Rather than duplicate the palette here as a second set of hex codes, this
 * module *reads the palette's tokens out of the DOM* at define time and hands
 * Monaco the resolved values. index.css stays the single source of truth;
 * change --syn-keyword there and the editor follows.
 */

export const QUALIUM_THEME = 'qualium'

/**
 * Monaco accepts only full-length `#RRGGBB` / `#RRGGBBAA` and throws
 * "Illegal value for token color" on anything else. Values read back out of the
 * stylesheet cannot be assumed to be six digits: the production CSS minifier
 * rewrites `#FFFFFF` to `#fff`, so `--surface-code` reads as `#FFFFFF` under
 * `vite dev` but `#fff` in a built bundle. Expanding shorthand here is what
 * keeps the two environments behaving the same.
 */
function normalizeHex(value, fallback = '#000000') {
  const v = (value || '').trim()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i.exec(v)
  if (short) {
    const [, r, g, b, a] = short
    return `#${r}${r}${g}${g}${b}${b}${a ? a + a : ''}`
  }
  return /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v : fallback
}

/** Read a custom property off :root, resolved to a literal by the browser. */
function token(css, name, fallback = '#000000') {
  return normalizeHex(css.getPropertyValue(name), fallback)
}

/** Monaco wants bare `RRGGBB` in rule foregrounds, not `#RRGGBB`. */
function bare(hex) {
  return normalizeHex(hex).slice(1, 7)
}

/** Append an 8-bit alpha to a `#RRGGBB`, for the few colours Monaco allows to
 *  be translucent (selection, line highlight). Any alpha already on the input
 *  is dropped so the result is never longer than `#RRGGBBAA`. */
function withAlpha(hex, alpha) {
  const a = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
  return `${normalizeHex(hex).slice(0, 7)}${a.toString(16).padStart(2, '0')}`
}

/**
 * (Re)register the Qualium editor theme from the tokens currently in effect,
 * and switch Monaco onto it.
 */
export function applyMonacoTheme(monaco) {
  if (!monaco?.editor) return

  const css = getComputedStyle(document.documentElement)

  // The editor takes the app's own --syn-* palette, with one exception. Every
  // role in that palette clears 4.5:1 on white, which is the bar a code editor
  // has to clear too, so there is no reason to keep a second set of hex codes
  // here. The exception is strings: --syn-string is a teal that sits too close
  // to --syn-class to tell apart at 13px, and brick red is what a developer's
  // muscle memory expects a string literal to be in a light editor.
  const keyword = token(css, '--syn-keyword')
  const cls = token(css, '--syn-class')
  const fn = token(css, '--syn-function')
  const string = '#A31515'
  const number = token(css, '--syn-number')
  const comment = token(css, '--syn-comment')
  const operator = token(css, '--syn-operator')

  const bg = token(css, '--surface-code')
  const fg = token(css, '--surface-code-text')
  const accent = token(css, '--accent')
  const muted = token(css, '--text-muted')
  const border = token(css, '--border')

  // defineTheme validates every colour and throws on a malformed one. This runs
  // from beforeMount, so an uncaught throw propagates into React and unmounts
  // the whole page — a blank screen caused purely by editor styling. Degrade to
  // Monaco's stock theme instead.
  try {
    defineQualiumTheme(monaco, { keyword, cls, fn, string, number, comment, operator, bg, fg, accent, muted, border, css })
    monaco.editor.setTheme(QUALIUM_THEME)
  } catch (error) {
    console.error('[editorTheme] falling back to the stock Monaco theme:', error)
    monaco.editor.setTheme('vs')
  }
}

function defineQualiumTheme(monaco, t) {
  const { keyword, cls, fn, string, number, comment, operator, bg, fg, accent, muted, border, css } = t

  monaco.editor.defineTheme(QUALIUM_THEME, {
    // Inheriting from the built-in light theme means any token type not listed
    // below still lands somewhere sane instead of rendering as plain text.
    base: 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: bare(fg) },
      { token: 'comment', foreground: bare(comment), fontStyle: 'italic' },
      { token: 'keyword', foreground: bare(keyword) },
      { token: 'keyword.flow', foreground: bare(keyword) },
      { token: 'string', foreground: bare(string) },
      { token: 'string.escape', foreground: bare(string) },
      { token: 'number', foreground: bare(number) },
      { token: 'regexp', foreground: bare(string) },
      { token: 'type', foreground: bare(cls) },
      { token: 'type.identifier', foreground: bare(cls) },
      { token: 'identifier', foreground: bare(fg) },
      { token: 'function', foreground: bare(fn) },
      { token: 'delimiter', foreground: bare(operator) },
      { token: 'operator', foreground: bare(operator) },
      { token: 'tag', foreground: bare(keyword) },
      { token: 'attribute.name', foreground: bare(fn) },
      { token: 'attribute.value', foreground: bare(string) },
    ],
    colors: {
      'editor.background': bg,
      'editor.foreground': fg,
      'editorGutter.background': bg,
      'editorLineNumber.foreground': withAlpha(muted, 0.65),
      'editorLineNumber.activeForeground': accent,
      'editorCursor.foreground': accent,
      'editor.selectionBackground': withAlpha(accent, 0.28),
      'editor.inactiveSelectionBackground': withAlpha(accent, 0.14),
      'editor.lineHighlightBackground': withAlpha(accent, 0.05),
      'editorIndentGuide.background1': border,
      'editorIndentGuide.activeBackground1': withAlpha(accent, 0.45),
      'editorWidget.background': token(css, '--surface-overlay'),
      'editorWidget.border': border,
      'editorSuggestWidget.background': token(css, '--surface-overlay'),
      'editorSuggestWidget.border': border,
      'editorSuggestWidget.selectedBackground': withAlpha(accent, 0.16),
      'scrollbarSlider.background': withAlpha(muted, 0.28),
      'scrollbarSlider.hoverBackground': withAlpha(muted, 0.45),
    },
  })
}

/**
 * Wire an <Editor> to the app palette.
 *
 *   const { beforeMount, theme } = useMonacoTheme()
 *   <Editor beforeMount={beforeMount} theme={theme} … />
 *
 * `beforeMount` registers the theme before the editor's first paint, so there
 * is no flash of the stock palette. There is one palette and it cannot change
 * at runtime, so registering once per editor is all this needs; it used to
 * carry an effect that re-registered on every theme flip.
 */
export function useMonacoTheme() {
  const beforeMount = useCallback(monaco => {
    applyMonacoTheme(monaco)
  }, [])

  return { beforeMount, theme: QUALIUM_THEME }
}
