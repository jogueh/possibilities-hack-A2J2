import { describe, it, expect } from 'vitest'
import {
  buildSnapshot,
  expandNode,
  initialsFromName,
  alignmentFromScore,
  type PersonInput,
} from '@/lib/web/snapshot'
import type { GoalQuery } from '@/types/web'

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
