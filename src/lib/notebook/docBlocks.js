// Bridge between the note's stored block-array schema and the single ProseMirror
// document the editor works on.
//
//   stored:  content = [ {type:'text', markdown}, {type:'code', …}, {type:'sketch', …}, … ]
//   editor:  one doc = [ …prose nodes…, runnableCode, …prose…, sketch, … ]
//
// Keeping the block-array as the persisted form means search, export, templates,
// PrintDocument, backlinks and duplicate all keep working unchanged — only the
// editing surface became continuous. Both directions go through the
// @tiptap/markdown MarkdownManager (editor.storage.markdown.manager) so text runs
// round-trip exactly as the standalone text blocks used to.

import { newId, textBlock, normalizeLanguage } from './notebookStore.js'
import { normalizeMindMap } from './mindmap.js'

// Last-resort text extraction from ProseMirror JSON, used when markdown
// serialization throws so the user's words survive even if the formatting can't.
function plainTextOf(nodes) {
  let out = ''
  for (const node of nodes || []) {
    if (typeof node?.text === 'string') out += node.text
    if (Array.isArray(node?.content)) out += plainTextOf(node.content)
    if (node?.type && node.type !== 'text') out += '\n'
  }
  return out
}

// Build a single ProseMirror doc (JSON) from the stored block array.
export function blocksToDoc(manager, content) {
  const nodes = []

  for (const block of content || []) {
    if (block.type === 'code') {
      nodes.push({
        type: 'runnableCode',
        attrs: {
          framework: normalizeLanguage(block.framework),
          code: block.code || '',
          lastResult: block.lastResult || null,
        },
      })
    } else if (block.type === 'sketch') {
      nodes.push({ type: 'sketch', attrs: { src: block.src || '' } })
    } else if (block.type === 'mindmap') {
      nodes.push({ type: 'mindMap', attrs: { data: normalizeMindMap(block.root) } })
    } else if (block.type === 'diagram') {
      nodes.push({ type: 'diagram', attrs: { code: block.code || '' } })
    } else if (block.type === 'plot') {
      nodes.push({
        type: 'dataPlot',
        attrs: {
          data: block.data || '',
          kind: block.kind || 'line',
          title: block.title || '',
          xLabel: block.xLabel || '',
          yLabel: block.yLabel || '',
        },
      })
    } else {
      // Text: parse markdown into prose nodes and splice them in at top level.
      let parsed
      try {
        parsed = manager.parse(block.markdown || '')
      } catch {
        parsed = null
      }
      const children = parsed?.content || []
      for (const child of children) nodes.push(child)
    }
  }

  if (nodes.length === 0) nodes.push({ type: 'paragraph' })
  return { type: 'doc', content: nodes }
}

// Serialize the editor's doc JSON back into the stored block array. Consecutive
// prose nodes collapse into one text block; each custom node becomes its own
// code/sketch/plot block. Fresh ids every call is fine — nothing keys on block-id
// stability across edits.
export function docToBlocks(manager, docJSON) {
  const blocks = []
  let buffer = []

  const flush = () => {
    if (buffer.length === 0) return
    let markdown = ''
    let failed = false
    try {
      markdown = manager.serialize({ type: 'doc', content: buffer }).trim()
    } catch {
      failed = true
    }
    if (failed) {
      // Serialization broke on this run. The old behaviour fell through to the
      // "drop empty blocks" path below, which persisted the loss — the user
      // watched their paragraph disappear. Keep the raw text instead: a block
      // with lost formatting beats a block with lost words.
      markdown = plainTextOf(buffer).trim()
      console.warn('[notebook] markdown serialization failed, kept plain text for this run')
    }
    // Drop runs that serialize to nothing (e.g. a single empty trailing paragraph)
    // so a note doesn't accumulate blank text blocks around every embed.
    if (markdown) blocks.push({ id: newId('b'), type: 'text', markdown })
    buffer = []
  }

  for (const node of docJSON?.content || []) {
    if (node.type === 'runnableCode') {
      flush()
      blocks.push({
        id: newId('b'),
        type: 'code',
        framework: normalizeLanguage(node.attrs?.framework),
        code: node.attrs?.code || '',
        lastResult: node.attrs?.lastResult || null,
      })
    } else if (node.type === 'mindMap') {
      flush()
      blocks.push({ id: newId('b'), type: 'mindmap', root: normalizeMindMap(node.attrs?.data) })
    } else if (node.type === 'diagram') {
      flush()
      blocks.push({ id: newId('b'), type: 'diagram', code: node.attrs?.code || '' })
    } else if (node.type === 'sketch') {
      flush()
      blocks.push({ id: newId('b'), type: 'sketch', src: node.attrs?.src || '' })
    } else if (node.type === 'dataPlot') {
      flush()
      blocks.push({
        id: newId('b'),
        type: 'plot',
        data: node.attrs?.data || '',
        kind: node.attrs?.kind || 'line',
        title: node.attrs?.title || '',
        xLabel: node.attrs?.xLabel || '',
        yLabel: node.attrs?.yLabel || '',
      })
    } else {
      buffer.push(node)
    }
  }
  flush()

  if (blocks.length === 0) blocks.push(textBlock(''))
  return blocks
}
