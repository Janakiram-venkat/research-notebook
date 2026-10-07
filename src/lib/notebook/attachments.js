// Notes that belong to a lesson or a project.
//
// The notebook worked well and sat entirely beside the rest of the product:
// nothing in a project linked to it, nothing in a note pointed back. Taking
// notes on a project meant opening a second surface and rebuilding the context
// by hand every time. An attachment is the join that closes that.
//
// Lessons no longer offer to start a note — the panel that did it was removed
// from the lesson page, and with it `lessonNoteSeed`. The *read* path for
// lessons stays, and must: notes attached to a lesson before that change still
// exist in people's notebooks, and resolveAttachment is what keeps their chip
// titled and linked instead of showing a bare id.
//
// The stored shape is `{ kind, id, label }` (migration 010). `label` is
// denormalized deliberately — see resolveAttachment below for what that buys
// and what it costs.

import { LESSON_TITLES } from '../lessons.js'
import { listNotes, textBlock, codeBlock } from './notebookStore.js'

export const ATTACHMENT_KINDS = ['lesson', 'project']

/**
 * Turn a stored attachment into something renderable.
 *
 * Returns `{ kind, id, label, href, resolved }`.
 *
 * `resolved` is the interesting field. A lesson id is checked against the live
 * roster, so a lesson that has been renamed shows its *current* title and a
 * lesson that has been removed degrades to a plain label with no link — never a
 * link to a 404. Project slugs have no roster the notebook can cheaply read
 * (their titles live inside the Projects page's data blob), so they are always
 * taken at face value and use the stored label.
 *
 * This runtime check is the real protection against orphaned attachments. The
 * phase-4 plan wanted a static `check:roster` guard, but attachments live in
 * per-user rows and check:roster is a static pass over repo files — it cannot
 * see anyone's notes. See the closing note in migration 010.
 */
export function resolveAttachment(attachment) {
  if (!attachment?.kind || !attachment?.id) return null
  const { kind, id, label } = attachment

  if (kind === 'lesson') {
    const liveTitle = LESSON_TITLES[id]
    if (!liveTitle) {
      // The lesson is gone from the roster. Keep the note's own record of what
      // it was about — that context is still useful to the person reading it —
      // but do not offer a link that leads nowhere.
      return { kind, id, label: label || id, href: null, resolved: false }
    }
    return { kind, id, label: liveTitle, href: `/lesson/${id}`, resolved: true }
  }

  return { kind, id, label: label || id, href: `/projects/${id}`, resolved: true }
}

/** Every note attached to one target, newest first (listNotes' own order). */
export function notesAttachedTo(kind, id) {
  if (!kind || !id) return []
  return listNotes().filter((n) => n.attachedTo?.kind === kind && n.attachedTo?.id === id)
}

/** Distinct attachment targets across the notebook, for grouping in the sidebar. */
export function attachmentTargets(notes) {
  const byKey = new Map()
  for (const note of notes) {
    const a = note.attachedTo
    if (!a?.kind || !a?.id) continue
    const key = `${a.kind}:${a.id}`
    const existing = byKey.get(key)
    if (existing) existing.count += 1
    else byKey.set(key, { key, ...resolveAttachment(a), count: 1 })
  }
  return [...byKey.values()].sort((x, y) => x.label.localeCompare(y.label))
}

/**
 * Seed content for a note started from a project workspace.
 *
 * Carries the brief's own framing rather than a generic header, and — where the
 * lab has starter code — a runnable block pre-filled with it. That pre-filled
 * block is the moment the notebook and the workspace stop being separate
 * features: the experiment arrives ready to run instead of waiting to be pasted.
 */
export function projectNoteSeed(project, { code, framework = 'qiskit' } = {}) {
  const title = project?.title || project?.slug || 'Project'
  const slug = project?.slug

  const content = [
    textBlock(
      [
        `# Lab notebook, ${title}`,
        '',
        slug ? `[Open the workspace](/projects/${slug})` : '',
        '',
        '## Objective',
        '',
        project?.summary ? `> ${project.summary}` : '',
        '',
        '## Method',
        '',
        // Result/Interpretation come after the code block when there is one —
        // appended below — so the note reads in the order the work happens.
        ...(code ? [] : ['## Result', '', '## Interpretation', '']),
      ]
        .filter((line, i, all) => !(line === '' && all[i - 1] === '')) // no double blanks
        .join('\n'),
    ),
  ]

  // The starter code lands as a runnable block, not as a fenced snippet in the
  // prose. A snippet would have to be copied into the Compiler to do anything;
  // a block runs where it sits, which is the difference between a note *about*
  // the experiment and a note that *is* the experiment. Result and
  // Interpretation follow it, so the note reads in the order the work happens.
  if (code) {
    content.push(codeBlock({ code, framework }))
    content.push(textBlock('## Result\n\n## Interpretation\n'))
  }

  return {
    title: `Lab notebook, ${title}`,
    attachedTo: slug ? { kind: 'project', id: slug, label: title } : null,
    content,
  }
}
