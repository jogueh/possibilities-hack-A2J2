import { describe, expect, it } from 'vitest'
import {
  buildWeb,
  DEFAULT_EDGE_STRENGTH,
  FIRST_DEGREE_MAX,
} from '@/lib/webBuilder'
import type { UserWithJobs } from '@/types/data'
import type { ParsedGoal } from '@/types/goal'

// ---------- Fixtures ----------

const goal: ParsedGoal = {
  intent: 'find SWE in SF',
  targetRole: 'Software Engineer',
  targetLocation: 'San Francisco, CA',
}

function makeUser(
  id: string,
  overrides: Partial<UserWithJobs> = {},
): UserWithJobs {
  return {
    id,
    name: `User ${id}`,
    school_history: [],
    job_history: [],
    current_location: 'San Francisco, CA',
    posts_activity: [],
    skills: [],
    courses: [],
    connections: [],
    ...overrides,
  }
}

/** Maps userId -> score so tests can drive the algorithm deterministically. */
function scorerByMap(scores: Record<string, number>) {
  return (u: UserWithJobs) => scores[u.id] ?? 0
}

// ---------- Tests ----------

describe('buildWeb — 1st-degree selection', () => {
  it('returns at most FIRST_DEGREE_MAX (5) 1st-degree nodes', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => makeUser(`u${i}`))
    const viewer = makeUser('viewer', {
      connections: candidates.map((c) => c.id),
    })
    const scores: Record<string, number> = {}
    for (let i = 0; i < 10; i++) scores[`u${i}`] = 90 - i
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, ...candidates],
      scorer: scorerByMap(scores),
    })
    const firstDegree = nodes.filter((n) => n.degree === 1)
    expect(firstDegree).toHaveLength(FIRST_DEGREE_MAX)
  })

  it('returns fewer than 5 when fewer connections clear the 40 threshold (no padding)', () => {
    const candidates = [
      makeUser('u_strong'),
      makeUser('u_moderate'),
      makeUser('u_weak1'),
      makeUser('u_weak2'),
      makeUser('u_weak3'),
    ]
    const viewer = makeUser('viewer', {
      connections: candidates.map((c) => c.id),
    })
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, ...candidates],
      scorer: scorerByMap({
        u_strong: 90,
        u_moderate: 50,
        u_weak1: 39,
        u_weak2: 20,
        u_weak3: 0,
      }),
    })
    const firstDegree = nodes.filter((n) => n.degree === 1)
    expect(firstDegree.map((n) => n.id)).toEqual(['u_strong', 'u_moderate'])
  })

  it('excludes the viewer even when the viewer appears in their own connection list', () => {
    const viewer = makeUser('viewer', {
      name: 'The Viewer',
      // Deliberately include the viewer's own id — the algorithm must drop it.
      connections: ['viewer', 'other'],
    })
    const other = makeUser('other', { name: 'Someone Else' })
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, other],
      scorer: scorerByMap({ viewer: 100, other: 80 }),
    })
    expect(nodes.find((n) => n.id === 'viewer')).toBeUndefined()
    expect(nodes.find((n) => n.id === 'other')).toBeDefined()
  })

  it('drops connections that are not present in the candidates set', () => {
    // 'ghost' is in the viewer's connections but not in `candidates` — the
    // builder can't render a node it can't resolve, so it is silently dropped.
    const viewer = makeUser('viewer', { connections: ['a', 'ghost', 'b'] })
    const a = makeUser('a')
    const b = makeUser('b')
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, a, b],
      scorer: scorerByMap({ a: 80, b: 70 }),
    })
    expect(nodes.map((n) => n.id).sort()).toEqual(['a', 'b'])
  })

  it('sorts 1st-degree nodes by descending score', () => {
    const viewer = makeUser('viewer', { connections: ['a', 'b', 'c'] })
    const candidates = [viewer, makeUser('a'), makeUser('b'), makeUser('c')]
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates,
      scorer: scorerByMap({ a: 50, b: 90, c: 70 }),
    })
    const firstDegree = nodes.filter((n) => n.degree === 1)
    expect(firstDegree.map((n) => n.id)).toEqual(['b', 'c', 'a'])
  })

  it('returns an empty payload when the viewer has no connections', () => {
    // viewer.connections === [] (the makeUser default).
    const candidates = [makeUser('viewer'), makeUser('u1'), makeUser('u2')]
    const { nodes, edges } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates,
      scorer: scorerByMap({ u1: 90, u2: 80 }),
    })
    expect(nodes).toEqual([])
    expect(edges).toEqual([])
  })

  it('returns an empty payload when no candidates qualify on score', () => {
    const viewer = makeUser('viewer', { connections: ['u1', 'u2'] })
    const candidates = [viewer, makeUser('u1'), makeUser('u2')]
    const { nodes, edges } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates,
      scorer: scorerByMap({ u1: 10, u2: 0 }),
    })
    expect(nodes).toEqual([])
    expect(edges).toEqual([])
  })

  it('returns an empty payload when the viewer is not in the candidates set', () => {
    // Connections live ON the viewer record, so an unknown viewer id yields
    // an empty connection list and therefore an empty web.
    const candidates = [makeUser('a'), makeUser('b')]
    const { nodes, edges } = buildWeb({
      viewerUserId: 'missing_viewer',
      parsedGoal: goal,
      candidates,
      scorer: scorerByMap({ a: 90, b: 80 }),
    })
    expect(nodes).toEqual([])
    expect(edges).toEqual([])
  })
})

describe('buildWeb — 2nd-degree selection (from member.connections)', () => {
  it("emits 2nd-degree nodes only from the parent's connections, ranked by score, filtered by the 70 threshold", () => {
    const fillers = Array.from({ length: 4 }, (_, i) => makeUser(`f${i}`))
    const parent = makeUser('parent', {
      connections: ['fofA', 'fofB', 'fofWeak'],
    })
    const fofA = makeUser('fofA')
    const fofB = makeUser('fofB')
    const fofWeak = makeUser('fofWeak')
    const stranger = makeUser('stranger') // not in parent's connections
    const viewer = makeUser('viewer', {
      connections: ['parent', 'f0', 'f1', 'f2', 'f3'],
    })

    const candidates = [
      viewer,
      parent,
      ...fillers,
      fofA,
      fofB,
      fofWeak,
      stranger,
    ]
    const scores: Record<string, number> = {
      parent: 99,
      f0: 95, f1: 94, f2: 93, f3: 92,
      fofA: 85,
      fofB: 75,
      fofWeak: 65, // below 70 — must be dropped
      stranger: 99, // high score but NOT connected to parent — must be dropped
    }

    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates,
      scorer: scorerByMap(scores),
    })

    const secondDegreeIds = nodes
      .filter((n) => n.degree === 2)
      .map((n) => n.id)
    // Sorted desc by score; stranger and fofWeak both excluded.
    expect(secondDegreeIds).toEqual(['fofA', 'fofB'])
  })

  it('caps 2nd-degree nodes per 1st-degree parent at 3', () => {
    const fillers = Array.from({ length: 4 }, (_, i) => makeUser(`f${i}`))
    const children = Array.from({ length: 5 }, (_, i) => makeUser(`c${i}`))
    const parent = makeUser('parent', {
      connections: children.map((c) => c.id),
    })
    const viewer = makeUser('viewer', {
      connections: ['parent', 'f0', 'f1', 'f2', 'f3'],
    })

    const scores: Record<string, number> = { parent: 99 }
    fillers.forEach((_, i) => (scores[`f${i}`] = 90 + i))
    // c0=84, c1=83, c2=82, c3=81, c4=80 — all clear 70, so the cap (not the
    // threshold) is what bounds the result.
    children.forEach((_, i) => (scores[`c${i}`] = 84 - i))

    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, parent, ...fillers, ...children],
      scorer: scorerByMap(scores),
    })

    const secondDegree = nodes.filter((n) => n.degree === 2)
    expect(secondDegree).toHaveLength(3)
    // Top 3 by score: c0(84), c1(83), c2(82).
    expect(secondDegree.map((n) => n.id)).toEqual(['c0', 'c1', 'c2'])
  })

  it('omits 2nd-degree for a parent whose connections all fail the 70 threshold', () => {
    const fillers = Array.from({ length: 4 }, (_, i) => makeUser(`f${i}`))
    const weak = makeUser('weak_fof')
    const parent = makeUser('parent', { connections: ['weak_fof'] })
    const viewer = makeUser('viewer', {
      connections: ['parent', 'f0', 'f1', 'f2', 'f3'],
    })

    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, parent, ...fillers, weak],
      scorer: scorerByMap({
        parent: 99,
        f0: 95, f1: 94, f2: 93, f3: 92,
        weak_fof: 50,
      }),
    })
    expect(nodes.filter((n) => n.degree === 2)).toHaveLength(0)
  })

  it('a single user appears at most once across the whole web', () => {
    const fillers = Array.from({ length: 3 }, (_, i) => makeUser(`f${i}`))
    // `shared` is a friend of BOTH 1st-degree nodes — the algorithm must
    // attach it to whichever parent processes it first (parentA, higher score).
    const parentA = makeUser('parentA', { connections: ['shared'] })
    const parentB = makeUser('parentB', { connections: ['shared'] })
    const shared = makeUser('shared')
    const viewer = makeUser('viewer', {
      connections: ['parentA', 'parentB', 'f0', 'f1', 'f2'],
    })

    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, parentA, parentB, ...fillers, shared],
      scorer: scorerByMap({
        parentA: 99, parentB: 98,
        f0: 95, f1: 94, f2: 93,
        shared: 85,
      }),
    })
    const ids = nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => id === 'shared')).toHaveLength(1)
  })

  it('never surfaces the viewer or an existing 1st-degree as a 2nd-degree of a parent', () => {
    const fillers = Array.from({ length: 3 }, (_, i) => makeUser(`f${i}`))
    const friend = makeUser('friend') // already a 1st-degree
    // parent's connections include the viewer AND another 1st-degree —
    // both must be dropped when picking 2nd-degree.
    const parent = makeUser('parent', { connections: ['viewer', 'friend'] })
    const viewer = makeUser('viewer', {
      connections: ['parent', 'friend', 'f0', 'f1', 'f2'],
    })

    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, parent, friend, ...fillers],
      scorer: scorerByMap({
        parent: 99, friend: 98,
        f0: 95, f1: 94, f2: 93,
      }),
    })
    expect(nodes.filter((n) => n.degree === 2)).toHaveLength(0)
  })
})

describe('buildWeb — edge wiring', () => {
  it('emits a solid edge from the viewer to each 1st-degree node', () => {
    const viewer = makeUser('viewer', { connections: ['a', 'b'] })
    const candidates = [viewer, makeUser('a'), makeUser('b')]
    const { edges } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates,
      scorer: scorerByMap({ a: 80, b: 60 }),
    })
    const firstEdges = edges.filter((e) => !e.isDotted)
    expect(firstEdges).toHaveLength(2)
    for (const e of firstEdges) {
      expect(e.source).toBe('viewer')
      expect(e.strength).toBe(DEFAULT_EDGE_STRENGTH)
      expect(e.isDotted).toBe(false)
      expect(e.id).toBe(`viewer__${e.target}`)
    }
  })

  it('emits dotted edges from a 1st-degree parent to its 2nd-degree nodes', () => {
    const fillers = Array.from({ length: 4 }, (_, i) => makeUser(`f${i}`))
    const child = makeUser('child')
    const parent = makeUser('parent', { connections: ['child'] })
    const viewer = makeUser('viewer', {
      connections: ['parent', 'f0', 'f1', 'f2', 'f3'],
    })
    const { edges } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, parent, ...fillers, child],
      scorer: scorerByMap({
        parent: 99,
        f0: 95, f1: 94, f2: 93, f3: 92,
        child: 80,
      }),
    })
    const dotted = edges.filter((e) => e.isDotted)
    expect(dotted).toEqual([
      {
        id: 'parent__child',
        source: 'parent',
        target: 'child',
        strength: DEFAULT_EDGE_STRENGTH,
        isDotted: true,
      },
    ])
  })
})

describe('buildWeb — WebNode shape', () => {
  it('every node has the expected WebNode contract fields', () => {
    const viewer = makeUser('viewer', { connections: ['a', 'b'] })
    const candidates = [
      viewer,
      makeUser('a', { name: 'Alice Anderson' }),
      makeUser('b', { name: 'Bob' }),
    ]
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates,
      scorer: scorerByMap({ a: 80, b: 50 }),
    })
    const a = nodes.find((n) => n.id === 'a')!
    expect(a.userId).toBe('a')
    expect(a.label).toBe('Alice Anderson')
    expect(a.degree).toBe(1)
    expect(a.avatarInitials).toBe('AA')
    expect(a.alignmentTier).toBe('strong')
    expect(a.interactionScore).toBe(0)
    expect(a.relevanceScore).toBe(80)
    expect(a.position).toEqual({ x: 0, y: 0 })

    const b = nodes.find((n) => n.id === 'b')!
    expect(b.avatarInitials).toBe('BO')
    expect(b.alignmentTier).toBe('moderate')
  })

  it('is deterministic for the same input', () => {
    const v = makeUser('v', { connections: ['a', 'b', 'c'] })
    const candidates = [v, makeUser('a'), makeUser('b'), makeUser('c')]
    const scorer = scorerByMap({ a: 80, b: 60, c: 50 })
    const one = buildWeb({
      viewerUserId: 'v',
      parsedGoal: goal,
      candidates,
      scorer,
    })
    const two = buildWeb({
      viewerUserId: 'v',
      parsedGoal: goal,
      candidates,
      scorer,
    })
    expect(one).toEqual(two)
  })
})
