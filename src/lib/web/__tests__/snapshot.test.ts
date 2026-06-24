import { describe, it, expect } from 'vitest'
import {
  buildSnapshot,
  expandNode,
  initialsFromName,
  alignmentFromScore,
  revealPerson,
  type PersonInput,
} from '@/lib/web/snapshot'
import type { GoalQuery } from '@/types/web'
import { NODE_MIN_DISTANCE } from '@/lib/web/layout'

const options = { width: 800, height: 600, ring1Radius: 100, ring2Radius: 200 }
const goal: GoalQuery = { raw: 'Break into product management', userId: 'self_1' }

const people: PersonInput[] = [
  { id: 'a', name: 'Ada Lovelace', degree: 1, interactionScore: 0.9, relevanceScore: 0.8 },
  { id: 'b', name: 'Bob Smith', degree: 1, interactionScore: 0.4, relevanceScore: 0.3 },
  { id: 'c', name: 'Carol Danvers', degree: 2, via: 'a', relevanceScore: 0.7 },
  { id: 'd', name: 'Dan Brown', degree: 2, via: 'a', relevanceScore: 0.2 },
  { id: 'e', name: 'Eve Polastri', degree: 2, via: 'b', relevanceScore: 0.5 },
]

describe('helpers', () => {
  it('derives initials from names', () => {
    expect(initialsFromName('Ada Lovelace')).toBe('AL')
    expect(initialsFromName('Cher')).toBe('CH')
    expect(initialsFromName('  ')).toBe('?')
  })

  it('buckets scores into alignment tiers', () => {
    expect(alignmentFromScore(0.9)).toBe('strong')
    expect(alignmentFromScore(0.5)).toBe('moderate')
    expect(alignmentFromScore(0.1)).toBe('weak')
  })
})

describe('buildSnapshot', () => {
  it('returns an empty snapshot when there is no goal', () => {
    const snap = buildSnapshot(null, people, options)
    expect(snap.state).toBe('empty')
    expect(snap.nodes).toHaveLength(0)
    expect(snap.edges).toHaveLength(0)
    expect(snap.goal).toBeNull()
  })

  it('seeds only 1st-degree nodes with solid self edges', () => {
    const snap = buildSnapshot(goal, people, options)
    expect(snap.state).toBe('seeded')
    expect(snap.nodes.map((n) => n.id).sort()).toEqual(['a', 'b'])
    expect(snap.nodes.every((n) => n.degree === 1)).toBe(true)
    expect(snap.edges).toHaveLength(2)
    expect(snap.edges.every((e) => e.source === 'self_1' && !e.isDotted)).toBe(true)
  })

  it('infers alignment tier and initials for seeded nodes', () => {
    const snap = buildSnapshot(goal, people, options)
    const a = snap.nodes.find((n) => n.id === 'a')!
    expect(a.avatarInitials).toBe('AL')
    expect(a.alignmentTier).toBe('strong')
  })

  it('derives a deterministic avatar photo and lets an explicit one override', () => {
    const snap = buildSnapshot(goal, people, options)
    const a = snap.nodes.find((n) => n.id === 'a')!
    // Derived from the member id via photoUrlForUser — stable randomuser portrait.
    expect(a.photo).toMatch(/^https:\/\/randomuser\.me\/api\/portraits\/(men|women)\/\d+\.jpg$/)
    expect(buildSnapshot(goal, people, options).nodes.find((n) => n.id === 'a')!.photo).toBe(a.photo)

    const withPhoto: PersonInput[] = [
      { id: 'a', name: 'Ada Lovelace', degree: 1, photo: 'https://example.com/ada.png' },
    ]
    const explicit = buildSnapshot(goal, withPhoto, options).nodes.find((n) => n.id === 'a')!
    expect(explicit.photo).toBe('https://example.com/ada.png')
  })
})

describe('expandNode', () => {
  it('reveals 2nd-degree nodes via the expanded connector with dotted edges', () => {
    const seeded = buildSnapshot(goal, people, options)
    const expanded = expandNode(seeded, 'a', people, options)
    expect(expanded.state).toBe('expanded')
    expect(expanded.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c', 'd'])
    const bridge = expanded.edges.filter((e) => e.isDotted)
    expect(bridge.map((e) => e.id).sort()).toEqual(['a__c', 'a__d'])
    // Original solid self edges are preserved.
    expect(expanded.edges.filter((e) => !e.isDotted)).toHaveLength(2)
  })

  it('is idempotent when expanding the same node twice', () => {
    const seeded = buildSnapshot(goal, people, options)
    const once = expandNode(seeded, 'a', people, options)
    const twice = expandNode(once, 'a', people, options)
    expect(twice).toEqual(once)
  })

  it('is a no-op for an unknown node or a 2nd-degree node', () => {
    const seeded = buildSnapshot(goal, people, options)
    expect(expandNode(seeded, 'ghost', people, options)).toEqual(seeded)
    expect(expandNode(seeded, 'c', people, options)).toEqual(seeded)
  })

  it('returns the snapshot unchanged when there is no goal', () => {
    const empty = buildSnapshot(null, people, options)
    expect(expandNode(empty, 'a', people, options)).toBe(empty)
  })
})

describe('revealPerson', () => {
  it('adds a single specific person without revealing their siblings', () => {
    // Both 'c' and 'd' are 2nd-degree children of 'a'. expandNode reveals
    // both — revealPerson should reveal only the one passed in.
    const seeded = buildSnapshot(goal, people, options)
    const cOnly = revealPerson(seeded, people.find((p) => p.id === 'c')!, options)
    expect(cOnly.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
    // d (c's sibling) stays hidden.
    expect(cOnly.nodes.some((n) => n.id === 'd')).toBe(false)
    // The bridge edge to c is dotted.
    const bridge = cOnly.edges.find((e) => e.target === 'c')
    expect(bridge).toMatchObject({ source: 'a', isDotted: true })
  })

  it('places sibling reveals at distinct positions (no overlap)', () => {
    // Revealing two siblings of the same parent in succession should put
    // them at DIFFERENT positions. Using the lone-child position for each
    // would land them on top of each other.
    const seeded = buildSnapshot(goal, people, options)
    const withC = revealPerson(seeded, people.find((p) => p.id === 'c')!, options)
    const withBoth = revealPerson(withC, people.find((p) => p.id === 'd')!, options)
    const c = withBoth.nodes.find((n) => n.id === 'c')!
    const d = withBoth.nodes.find((n) => n.id === 'd')!
    expect(c.position).not.toEqual(d.position)
  })

  it('is a no-op if the person is already in the snapshot', () => {
    const seeded = buildSnapshot(goal, people, options)
    const expanded = expandNode(seeded, 'a', people, options)
    // c is already in the snapshot from expandNode.
    const noop = revealPerson(expanded, people.find((p) => p.id === 'c')!, options)
    expect(noop).toBe(expanded)
  })

  it('is a no-op if the via parent is not yet in the snapshot', () => {
    // Try to reveal 'c' (via='a') against an empty seeded snapshot for goal
    // with no people — parent missing, must skip.
    const empty = buildSnapshot(goal, [], options)
    const result = revealPerson(empty, people.find((p) => p.id === 'c')!, options)
    expect(result).toBe(empty)
  })

  it('returns the snapshot unchanged when there is no goal', () => {
    const empty = buildSnapshot(null, people, options)
    expect(revealPerson(empty, people.find((p) => p.id === 'c')!, options)).toBe(empty)
  })
})

describe('expandNode collision avoidance', () => {
  it('keeps every node at least NODE_MIN_DISTANCE from the centre and from each other', () => {
    const seeded = buildSnapshot(goal, people, options)
    const expanded = expandNode(seeded, 'a', people, options)
    const center = { x: options.width / 2, y: options.height / 2 }
    const points = [center, ...expanded.nodes.map((n) => n.position)]
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dist = Math.hypot(
          points[i].x - points[j].x,
          points[i].y - points[j].y,
        )
        expect(dist).toBeGreaterThanOrEqual(NODE_MIN_DISTANCE - 0.01)
      }
    }
  })
})
