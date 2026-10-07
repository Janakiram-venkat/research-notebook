// Lightweight markdown renderer for notebook text blocks.
//
// Deliberately small (no remark/MDX pipeline) — it covers the subset learners
// actually use in notes: headings, lists, checklists, blockquotes, rules,
// fenced code, inline emphasis/code/links, and LaTeX via KaTeX
// (inline `$...$` / `\(...\)`, block `$$...$$` / `\[...\]`).
// Math reuses the app's <MathText/>.

import { listNotes } from '../../lib/notebook/notebookStore.js'
import { wikiLinkRegex, wikiLinkParts, CALLOUT_TYPES } from '../../lib/notebook/noteUtils.js'
import MathText from '../MathText.jsx'
import { MathContent } from '../RichMathText.jsx'

// Link and image targets come from note text, which can arrive via an imported
// backup, so only known-safe schemes are allowed. Anything else (javascript:,
// vbscript:, data: HTML) becomes an inert "#". Images may also be data:image/
// (embedded uploads), but never SVG-as-HTML via other data: types.
const SAFE_LINK = /^(https?:|mailto:|#|\/(?!\/)|\.{0,2}\/)/i
const SAFE_IMAGE = /^(https?:|blob:|data:image\/(png|jpe?g|gif|webp|avif);|\/(?!\/)|\.{0,2}\/)/i
function safeUrl(url, image = false) {
  // Browsers ignore tabs/newlines/control chars inside a scheme ("java\tscript:").
  // eslint-disable-next-line no-control-regex
  const u = String(url).trim().replace(/[\u0000- ]+/g, '')
  return (image ? SAFE_IMAGE : SAFE_LINK).test(u) ? url.trim() : '#'
}

// ── inline parsing ────────────────────────────────────────────────────────────
// Find the earliest inline token and render around it, recursively. The image
// alternative must precede the plain-link one so `![alt](src)` isn't matched as
// a link with a stray leading `!`. `++text++` is how TipTap serializes underline.
const INLINE_RE =
  /(\\\([^\n]+?\\\))|(\$[^$\n]+?\$)|(\[\[[^\]\n]+?\]\])|(`[^`\n]+?`)|(==[^\n]+?==)|(\+\+[^\n]+?\+\+)|(~~[^~\n]+?~~)|(\*\*[^*\n]+?\*\*)|(\*[^*\n]+?\*)|(!\[[^\]\n]*?\]\([^)\n]+?\))|(\[[^\]\n]+?\]\([^)\n]+?\))/

// Resolve a `[[…]]` token to a route. A link stored with a note id keeps
// pointing at that note; a bare label falls back to matching a title, then to
// the dashboard search so the user can still find (or create) the target.
function noteLinkTarget(token) {
  const m = token.match(wikiLinkRegex())
  const { noteId, label } = m ? wikiLinkParts(m[1], m[2]) : { noteId: null, label: token.slice(2, -2).trim() }
  const notes = listNotes()
  const match =
    (noteId && notes.find((note) => note.id === noteId)) ||
    notes.find((note) => (note.title || '').trim().toLowerCase() === label.toLowerCase())
  return {
    label,
    href: match ? `/notebook/${match.id}` : `/notebook?search=${encodeURIComponent(label)}`,
    resolved: Boolean(match),
  }
}

function renderInline(text, keyBase) {
  const nodes = []
  let rest = text
  let i = 0

  while (rest.length) {
    const m = rest.match(INLINE_RE)
    if (!m) {
      nodes.push(<MathContent key={`${keyBase}-plain-${i++}`}>{rest}</MathContent>)
      break
    }
    if (m.index > 0) {
      nodes.push(<MathContent key={`${keyBase}-plain-${i++}`}>{rest.slice(0, m.index)}</MathContent>)
    }
    const token = m[0]
    const key = `${keyBase}-${i++}`

    if (token.startsWith('\\(')) {
      nodes.push(<MathText key={key} value={token.slice(2, -2)} />)
    } else if (token.startsWith('$')) {
      nodes.push(<MathText key={key} value={token.slice(1, -1)} />)
    } else if (token.startsWith('[[')) {
      const { label, href, resolved } = noteLinkTarget(token)
      nodes.push(
        <a key={key} href={href} className={`nb-wiki-link${resolved ? '' : ' is-unresolved'}`}>
          {label}
        </a>
      )
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="nb-inline-code">
          {token.slice(1, -1)}
        </code>
      )
    } else if (token.startsWith('==')) {
      nodes.push(<mark key={key} className="nb-md-mark">{renderInline(token.slice(2, -2), key)}</mark>)
    } else if (token.startsWith('++')) {
      nodes.push(<u key={key}>{renderInline(token.slice(2, -2), key)}</u>)
    } else if (token.startsWith('~~')) {
      nodes.push(<del key={key}>{renderInline(token.slice(2, -2), key)}</del>)
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>)
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>)
    } else if (token.startsWith('![')) {
      const imgMatch = token.match(/^!\[([^\]]*?)\]\(([^)]+?)\)$/)
      nodes.push(
        <img key={key} src={safeUrl(imgMatch[2], true)} alt={imgMatch[1] || 'Embedded image'} className="nb-md-img" />
      )
    } else {
      const linkMatch = token.match(/^\[([^\]]+?)\]\(([^)]+?)\)$/)
      nodes.push(
        <a key={key} href={safeUrl(linkMatch[2])} target="_blank" rel="noopener noreferrer" className="nb-link">
          <MathContent>{linkMatch[1]}</MathContent>
        </a>
      )
    }
    rest = rest.slice(m.index + token.length)
  }

  return nodes
}

// ── block parsing ─────────────────────────────────────────────────────────────
const HEADING_RE = /^(#{1,6})\s+(.*)$/
const UL_RE = /^[-*]\s+(.*)$/
const CHECK_RE = /^[-*]\s+\[([ xX])\]\s+(.*)$/
const OL_RE = /^\d+\.\s+(.*)$/
const HR_RE = /^(-{3,}|\*{3,}|_{3,})$/
const CALLOUT_RE = new RegExp(`^\\[!(${CALLOUT_TYPES.join('|')})\\]\\s*(.*)$`, 'i')

function readBlockMath(lines, startIndex, opener, closer) {
  const start = lines[startIndex].trim()
  const buf = []
  const inline = start.slice(opener.length)

  if (inline.trim().endsWith(closer) && inline.trim().length > closer.length) {
    buf.push(inline.trim().slice(0, -closer.length))
    return { value: buf.join('\n'), nextIndex: startIndex + 1 }
  }

  if (inline.trim()) buf.push(inline)
  let i = startIndex + 1
  while (i < lines.length && !lines[i].trim().endsWith(closer)) {
    buf.push(lines[i])
    i++
  }
  if (i < lines.length) {
    const last = lines[i].trim()
    if (last !== closer) buf.push(last.slice(0, -closer.length))
    i++
  }

  return { value: buf.join('\n'), nextIndex: i }
}

export default function MarkdownView({ markdown = '' }) {
  if (!markdown.trim()) {
    return <p className="nb-md-empty">Empty note. Click to start writing…</p>
  }

  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // blank line → spacing
    if (!trimmed) {
      i++
      continue
    }

    // fenced code ```
    if (trimmed.startsWith('```')) {
      const code = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i])
        i++
      }
      i++ // closing fence
      blocks.push(
        <pre key={key++} className="nb-md-pre">
          <code>{code.join('\n')}</code>
        </pre>
      )
      continue
    }

    // block math $$ ... $$ or \[ ... \]
    if (trimmed.startsWith('$$') || trimmed.startsWith('\\[')) {
      const opener = trimmed.startsWith('$$') ? '$$' : '\\['
      const closer = opener === '$$' ? '$$' : '\\]'
      const math = readBlockMath(lines, i, opener, closer)
      blocks.push(<MathText key={key++} value={math.value} block className="nb-md-blockmath" />)
      i = math.nextIndex
      continue
    }

    // heading
    const h = line.match(HEADING_RE)
    if (h) {
      const level = Math.min(h[1].length, 4)
      const Tag = `h${level}`
      blocks.push(
        <Tag key={key++} className={`nb-md-h nb-md-h${level}`}>
          {renderInline(h[2], `h${key}`)}
        </Tag>
      )
      i++
      continue
    }

    // horizontal rule
    if (HR_RE.test(trimmed)) {
      blocks.push(<hr key={key++} className="nb-md-hr" />)
      i++
      continue
    }

    // blockquote (consecutive > lines)
    if (trimmed.startsWith('>')) {
      const quote = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      const calloutMatch = quote[0]?.match(CALLOUT_RE)
      if (calloutMatch) {
        const [, type, title] = calloutMatch
        const body = quote.slice(1).join(' ')
        blocks.push(
          <aside key={key++} className={`nb-md-callout nb-md-callout-${type.toLowerCase()}`}>
            <strong>{title || type}</strong>
            {body && <span>{renderInline(body, `co${key}`)}</span>}
          </aside>
        )
        continue
      }
      blocks.push(
        <blockquote key={key++} className="nb-md-quote">
          {renderInline(quote.join(' '), `q${key}`)}
        </blockquote>
      )
      continue
    }

    // checklist / unordered list / ordered list
    if (CHECK_RE.test(trimmed) || UL_RE.test(trimmed) || OL_RE.test(trimmed)) {
      const ordered = OL_RE.test(trimmed) && !CHECK_RE.test(trimmed) && !UL_RE.test(trimmed)
      const items = []
      while (i < lines.length) {
        const t = lines[i].trim()
        const cm = t.match(CHECK_RE)
        const um = t.match(UL_RE)
        const om = t.match(OL_RE)
        if (cm) {
          items.push(
            <li key={items.length} className="nb-md-check">
              <input type="checkbox" checked={cm[1].toLowerCase() === 'x'} readOnly />
              <span>{renderInline(cm[2], `c${key}-${items.length}`)}</span>
            </li>
          )
        } else if (um) {
          items.push(<li key={items.length}>{renderInline(um[1], `u${key}-${items.length}`)}</li>)
        } else if (om) {
          items.push(<li key={items.length}>{renderInline(om[1], `o${key}-${items.length}`)}</li>)
        } else {
          break
        }
        i++
      }
      const ListTag = ordered ? 'ol' : 'ul'
      blocks.push(
        <ListTag key={key++} className={`nb-md-list${ordered ? ' nb-md-ol' : ''}`}>
          {items}
        </ListTag>
      )
      continue
    }

    // paragraph
    const para = [trimmed]
    i++
    while (i < lines.length) {
      const t = lines[i].trim()
      if (
        !t ||
        HEADING_RE.test(t) ||
        t.startsWith('>') ||
        t.startsWith('```') ||
        t.startsWith('$$') ||
        t.startsWith('\\[') ||
        HR_RE.test(t) ||
        CHECK_RE.test(t) ||
        UL_RE.test(t) ||
        OL_RE.test(t)
      ) {
        break
      }
      para.push(t)
      i++
    }
    blocks.push(
      <p key={key++} className="nb-md-p">
        {renderInline(para.join(' '), `p${key}`)}
      </p>
    )
  }

  return <div className="nb-md">{blocks}</div>
}
