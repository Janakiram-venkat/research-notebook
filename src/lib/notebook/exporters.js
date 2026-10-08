// Getting notes out of the notebook and back in, in formats other tools read.
//
//   notes -> a .zip of Markdown files (folders become directories, tags go in
//            front-matter), the shape Obsidian and most note apps import
//   .md / .zip -> notes (front-matter tags and folder are honoured; the first
//            "# Heading" becomes the title when there is no title: field)
//
// The pure functions have no DOM or store dependency so they can be tested.

import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import { mindMapToMarkdown, normalizeMindMap } from './mindmap.js'

const UNSAFE = /[\\/:*?"<>|\p{Cc}]/gu

export function safeName(text, fallback = 'Untitled') {
  const cleaned = String(text || '').replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return cleaned || fallback
}

// ── note -> markdown ──────────────────────────────────────────────────────────
export function noteToMarkdown(note) {
  const parts = []
  for (const block of note.content || []) {
    if (block.type === 'text') parts.push(block.markdown || '')
    else if (block.type === 'code') {
      parts.push('```' + (block.framework || 'python') + '\n' + (block.code || '') + '\n```')
      const out = block.lastResult?.output
      if (out) parts.push('Output:\n\n```\n' + out + '\n```')
    } else if (block.type === 'mindmap') parts.push(mindMapToMarkdown(normalizeMindMap(block.root)))
    else if (block.type === 'diagram') parts.push('```mermaid\n' + (block.code || '') + '\n```')
  }
  return parts.join('\n\n').trim()
}

function frontMatter(note) {
  const lines = ['---', `title: ${JSON.stringify(note.title || 'Untitled note')}`]
  if (note.folder) lines.push(`folder: ${JSON.stringify(note.folder)}`)
  if (note.tags?.length) lines.push(`tags: [${note.tags.map((t) => JSON.stringify(t)).join(', ')}]`)
  if (note.createdAt) lines.push(`created: ${new Date(note.createdAt).toISOString()}`)
  lines.push('---', '')
  return lines.join('\n')
}

export function noteToFile(note) {
  return frontMatter(note) + '\n' + noteToMarkdown(note) + '\n'
}

// ── notes -> zip ──────────────────────────────────────────────────────────────
export function buildZip(notes) {
  const files = {}
  const used = new Set()
  for (const note of notes) {
    const dir = note.folder && note.folder !== 'General' ? safeName(note.folder) + '/' : ''
    const base = safeName(note.title)
    let path = `${dir}${base}.md`
    for (let i = 2; used.has(path.toLowerCase()); i += 1) path = `${dir}${base} (${i}).md`
    used.add(path.toLowerCase())
    files[path] = strToU8(noteToFile(note))
  }
  return zipSync(files)
}

// ── markdown -> note ──────────────────────────────────────────────────────────
function unquote(value) {
  const v = value.trim()
  if (v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v) } catch { /* fall through */ }
  }
  return v.replace(/^['"]|['"]$/g, '')
}

function parseList(value) {
  const v = value.trim()
  const inner = v.startsWith('[') && v.endsWith(']') ? v.slice(1, -1) : v
  return inner.split(',').map((s) => unquote(s).replace(/^#/, '')).filter(Boolean)
}

// Splits "---\nkey: value\n---\nbody" into { meta, body }. Supports the YAML that
// note apps actually write: scalars, inline lists, and "- item" lists.
export function splitFrontMatter(text) {
  const m = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!m) return { meta: {}, body: text }
  const meta = {}
  let listKey = null
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item && listKey) { meta[listKey].push(unquote(item[1]).replace(/^#/, '')); continue }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (!kv) continue
    const [, key, value] = kv
    if (value === '') { meta[key] = []; listKey = key } else { meta[key] = value; listKey = null }
  }
  return { meta, body: text.slice(m[0].length) }
}

export function parseMarkdownFile(path, text, { newId, textBlock }) {
  const { meta, body } = splitFrontMatter(text)
  const parts = path.split('/').filter(Boolean)
  const file = parts.pop() || 'Untitled.md'
  const fromName = file.replace(/\.(md|markdown|txt)$/i, '')
  let title = typeof meta.title === 'string' ? unquote(meta.title) : ''
  let content = body.replace(/^\s+/, '')
  if (!title) {
    const h1 = /^#\s+(.+)\r?\n?/.exec(content)
    if (h1) { title = h1[1].trim(); content = content.slice(h1[0].length).replace(/^\s+/, '') }
  }
  const tagValue = meta.tags ?? meta.tag
  const tags = Array.isArray(tagValue) ? tagValue : typeof tagValue === 'string' ? parseList(tagValue) : []
  const folder = (typeof meta.folder === 'string' && unquote(meta.folder)) || parts[parts.length - 1] || 'General'
  const created = Date.parse(meta.created) || Date.now()
  return {
    id: newId('note'),
    title: title || fromName,
    folder,
    tags,
    pinned: false,
    content: [textBlock(content.trimEnd())],
    createdAt: created,
    updatedAt: Date.now(),
  }
}

// bytes of a .zip -> [{ path, text }] for every Markdown/text file inside.
export function readZip(bytes) {
  const entries = unzipSync(bytes)
  return Object.entries(entries)
    .filter(([path]) => /\.(md|markdown|txt)$/i.test(path) && !path.startsWith('__MACOSX/') && !path.split('/').some((p) => p.startsWith('.')))
    .map(([path, data]) => ({ path, text: strFromU8(data) }))
}

// Browser File -> note objects ready for importNotes(). Throws a readable Error.
export async function notesFromFile(file, helpers) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.json')) {
    const payload = JSON.parse(await file.text())
    return { kind: 'json', payload }
  }
  let files
  if (name.endsWith('.zip')) {
    try { files = readZip(new Uint8Array(await file.arrayBuffer())) } catch { throw new Error('That zip file could not be read.') }
  } else if (/\.(md|markdown|txt)$/.test(name)) {
    files = [{ path: file.name, text: await file.text() }]
  } else {
    throw new Error('Use a .md, .zip or .json file.')
  }
  if (!files.length) throw new Error('No Markdown files were found in that file.')
  return { kind: 'markdown', payload: { notes: files.map((f) => parseMarkdownFile(f.path, f.text, helpers)) } }
}

// ── browser downloads ─────────────────────────────────────────────────────────
function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const today = () => new Date().toISOString().slice(0, 10)

export function downloadJson(bundle, stem = 'research-notebook') {
  download(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }), `${stem}-${today()}.json`)
  return bundle.notes?.length ?? 0
}

export function downloadZip(notes, stem = 'research-notebook') {
  download(new Blob([buildZip(notes)], { type: 'application/zip' }), `${stem}-markdown-${today()}.zip`)
  return notes.length
}
