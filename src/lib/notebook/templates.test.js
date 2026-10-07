/**
 * Note templates.
 *
 * Two things are worth pinning. First, `build()` must return *fresh* blocks
 * every call: the ids are what the editor keys on, so two notes created from
 * one template sharing block ids would have them stand on each other in the
 * store. Second, `STARTER_TEMPLATE_IDS` names the three starters the empty
 * notebook offers by id — a renamed or removed template would leave the first
 * screen of the product showing a blank card, which is the one screen where a
 * new user has nothing else to go on.
 *
 * Node environment: `build()` is pure and the store's block factories touch no
 * storage.
 */

import { describe, expect, it } from 'vitest'
import { TEMPLATES, STARTER_TEMPLATE_IDS, getTemplate, templateBlockTypes } from './templates.js'

describe('template roster', () => {
  it('has a unique id, a label and a description for every entry', () => {
    const ids = TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of TEMPLATES) {
      expect(t.label).toBeTruthy()
      expect(t.description).toBeTruthy()
    }
  })

  it('builds notes whose blocks are all well-formed', () => {
    for (const t of TEMPLATES) {
      const seed = t.build()
      expect(seed.title).toBeTruthy()
      expect(seed.content.length).toBeGreaterThan(0)
      for (const block of seed.content) {
        expect(block.id).toBeTruthy()
        expect(['text', 'code', 'circuit']).toContain(block.type)
      }
    }
  })

  it('gives every build its own block ids', () => {
    for (const t of TEMPLATES) {
      const first = t.build().content.map((b) => b.id)
      const second = t.build().content.map((b) => b.id)
      expect(first.some((id) => second.includes(id))).toBe(false)
    }
  })

  it('falls back to the first template for an unknown id', () => {
    expect(getTemplate('no-such-template')).toBe(TEMPLATES[0])
  })
})

describe('starter templates', () => {
  // The empty state renders one card per id, reading label and description off
  // the template. An id with no template renders an empty card.
  it('all resolve to real templates', () => {
    for (const id of STARTER_TEMPLATE_IDS) {
      expect(TEMPLATES.some((t) => t.id === id)).toBe(true)
    }
  })

  it('offers something blank, something for a lab run, and something runnable', () => {
    expect(STARTER_TEMPLATE_IDS).toEqual(['blank', 'experiment', 'scratchpad'])
    expect(templateBlockTypes(getTemplate('blank'))).toEqual(['text'])
    expect(templateBlockTypes(getTemplate('experiment'))).toContain('circuit')
    expect(templateBlockTypes(getTemplate('scratchpad'))).toContain('code')
  })
})

describe('templateBlockTypes', () => {
  it('reports each type once, in a fixed reading order', () => {
    expect(templateBlockTypes(getTemplate('lab-report'))).toEqual(['text', 'code', 'circuit'])
  })
})
