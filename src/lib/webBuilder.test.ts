import { describe, expect, it } from 'vitest'
import {
  buildWeb,
  DEFAULT_EDGE_STRENGTH,
  FIRST_DEGREE_MAX,
  MAX_DEGREE,
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

  it('falls back to suggestConnections when the viewer has no direct connections (cold-start)', () => {
    // Viewer record has connections=[] (the makeUser default). The cold-start
    // fallback should seed the 1st-degree pool with structural suggestions —
    // here, the most-connected hubs ('a' has 2 connections, 'b' has 1) — and
    // then rank them by goal score the same way real connections are ranked.
    const viewer = makeUser('viewer')
    const a = makeUser('a', { connections: ['b', 'c'] })
    const b = makeUser('b', { connections: ['a'] })
    const c = makeUser('c')
    const { nodes, edges } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, a, b, c],
      scorer: scorerByMap({ a: 90, b: 70, c: 50 }),
    })
    // 'c' has 0 connections (hub fallback last); 'a' + 'b' are picked first
    // and both clear the 40 threshold. 'c' joins at degree 1 too because the
    // hub fallback returns up to FIRST_DEGREE_MAX suggestions and it scores 50.
    const firstDegreeIds = nodes
      .filter((n) => n.degree === 1)
      .map((n) => n.id)
      .sort()
    expect(firstDegreeIds).toEqual(['a', 'b', 'c'])
    // All edges from the viewer are still SOLID — the UI treats the
    // cold-start fallback the same as real 1st-degree connections.
    expect(edges.every((e) => !e.isDotted && e.source === 'viewer')).toBe(true)
  })

  it('cold-start fallback still respects the FIRST_DEGREE_MIN_SCORE threshold', () => {
    const viewer = makeUser('viewer') // connections=[]
    const a = makeUser('a', { connections: ['b'] })
    const b = makeUser('b')
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, a, b],
      // Both suggested by the fallback but neither clears 40.
      scorer: scorerByMap({ a: 30, b: 10 }),
    })
    expect(nodes).toEqual([])
  })

  it('falls back to top-N connections by score when none clear the threshold (weak-match fallback)', () => {
    // Real connections, none of which clear FIRST_DEGREE_MIN_SCORE (40).
    // Old behaviour returned an empty web; new behaviour surfaces the top
    // FIRST_DEGREE_MAX so the user with a real network never sees a blank
    // canvas. Visual weak-match cue lives in the node's alignmentTier.
    const viewer = makeUser('viewer', { connections: ['u1', 'u2', 'u3'] })
    const candidates = [
      viewer,
      makeUser('u1'),
      makeUser('u2'),
      makeUser('u3'),
    ]
    const { nodes, edges } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates,
      scorer: scorerByMap({ u1: 30, u2: 20, u3: 5 }),
    })
    const firstDegree = nodes.filter((n) => n.degree === 1)
    expect(firstDegree.map((n) => n.id)).toEqual(['u1', 'u2', 'u3'])
    // The alignmentTier still reflects the weak score (< 40) so the UI can
    // surface the visual weak-match cue.
    expect(firstDegree.every((n) => n.alignmentTier === 'weak')).toBe(true)
    expect(edges).toHaveLength(3)
    expect(edges.every((e) => e.source === 'viewer' && !e.isDotted)).toBe(true)
  })

  it('weak-match fallback caps at FIRST_DEGREE_MAX', () => {
    const connectionIds = Array.from({ length: 8 }, (_, i) => `u${i}`)
    const viewer = makeUser('viewer', { connections: connectionIds })
    const candidates = [viewer, ...connectionIds.map((id) => makeUser(id))]
    const scores: Record<string, number> = {}
    // 30, 28, 26 ... — all below the 40 threshold.
    connectionIds.forEach((id, i) => (scores[id] = 30 - i * 2))
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates,
      scorer: scorerByMap(scores),
    })
    const firstDegree = nodes.filter((n) => n.degree === 1)
    expect(firstDegree).toHaveLength(FIRST_DEGREE_MAX)
    // Top 5 by score: u0..u4 (30, 28, 26, 24, 22).
    expect(firstDegree.map((n) => n.id)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4'])
  })

  it('returns an empty payload when the viewer has no connections AND cold-start finds nothing', () => {
    // Viewer.connections === [] and no other candidates have connections, so
    // suggestConnections returns []. New behaviour: empty web (preserved).
    const viewer = makeUser('viewer')
    const a = makeUser('a')
    const b = makeUser('b')
    const { nodes, edges } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, a, b],
      scorer: scorerByMap({ a: 90, b: 80 }),
    })
    // No connections + no 2nd-degree warm paths → cold-start hub fallback
    // surfaces 'a' and 'b' (each has 0 connections, so they tie; id sort
    // breaks the tie deterministically), then the score threshold (>= 40)
    // gates them in because their scores are 90/80.
    expect(nodes.map((n) => n.id)).toEqual(['a', 'b'])
    expect(edges.map((e) => e.source).every((s) => s === 'viewer')).toBe(true)
  })

  it('returns an empty payload when the viewer is not in the candidates set', () => {
    // Unknown viewer id → suggestConnections is passed `undefined` and
    // returns [] → empty web. No edges to strangers outside the dataset.
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

  it("falls back to top-N friends-of-friends when none clear the 70 threshold (weak-match fallback)", () => {
    const fillers = Array.from({ length: 4 }, (_, i) => makeUser(`f${i}`))
    // 4 weak friends-of-friends — none clear 70, mirroring a location-only
    // goal like "find people in SF" where the scorer caps at ~30 points.
    const fof1 = makeUser('fof1')
    const fof2 = makeUser('fof2')
    const fof3 = makeUser('fof3')
    const fof4 = makeUser('fof4')
    const parent = makeUser('parent', {
      connections: ['fof1', 'fof2', 'fof3', 'fof4'],
    })
    const viewer = makeUser('viewer', {
      connections: ['parent', 'f0', 'f1', 'f2', 'f3'],
    })

    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, parent, ...fillers, fof1, fof2, fof3, fof4],
      scorer: scorerByMap({
        parent: 99,
        f0: 95, f1: 94, f2: 93, f3: 92,
        fof1: 30, fof2: 25, fof3: 10, fof4: 5,
      }),
    })

    const secondDegree = nodes.filter((n) => n.degree === 2)
    // Cap at SECOND_DEGREE_PER_NODE_MAX (3), sorted desc by score.
    expect(secondDegree.map((n) => n.id)).toEqual(['fof1', 'fof2', 'fof3'])
    // All surfaced via the fallback get the weak tier (< 40 → weak).
    expect(secondDegree.every((n) => n.alignmentTier === 'weak')).toBe(true)
  })

  it('omits 2nd-degree for a parent with no friends-of-friends in the candidate set', () => {
    // Parent has zero friends outside the viewer / existing 1st-degree, so
    // there is literally nobody to surface — empty regardless of threshold.
    const fillers = Array.from({ length: 4 }, (_, i) => makeUser(`f${i}`))
    const parent = makeUser('parent', { connections: [] })
    const viewer = makeUser('viewer', {
      connections: ['parent', 'f0', 'f1', 'f2', 'f3'],
    })

    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, parent, ...fillers],
      scorer: scorerByMap({
        parent: 99,
        f0: 95, f1: 94, f2: 93, f3: 92,
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
    expect(nodes.filter((n) => n.degree === 2).length).toBe(0)
  })
})

describe('buildWeb — deep expansion (rings 3+ via MAX_DEGREE loop)', () => {
  it('emits 3rd-degree nodes via 2nd-degree parents, dotted edges, sorted by score', () => {
    const viewer = makeUser('viewer', { connections: ['p1', 'p2', 'p3', 'p4', 'p5'] })
    const p1 = makeUser('p1', { connections: ['f1', 'f2'] })
    const fillers = Array.from({ length: 4 }, (_, i) => makeUser(`p${i + 2}`))
    const f1 = makeUser('f1', { connections: ['g1', 'g2'] })
    const f2 = makeUser('f2', { connections: ['g3'] })
    const g1 = makeUser('g1')
    const g2 = makeUser('g2')
    const g3 = makeUser('g3')

    const { nodes, edges } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, p1, ...fillers, f1, f2, g1, g2, g3],
      scorer: scorerByMap({
        p1: 90, p2: 85, p3: 84, p4: 83, p5: 82,
        f1: 80, f2: 75,
        g1: 90, g2: 75, g3: 71,
      }),
    })

    const thirdDegree = nodes.filter((n) => n.degree === 3)
    expect(thirdDegree.map((n) => n.id).sort()).toEqual(['g1', 'g2', 'g3'])
    // Each 3rd-degree is reached via a dotted edge from its 2nd-degree parent.
    expect(edges.find((e) => e.target === 'g1')).toMatchObject({ source: 'f1', isDotted: true })
    expect(edges.find((e) => e.target === 'g2')).toMatchObject({ source: 'f1', isDotted: true })
    expect(edges.find((e) => e.target === 'g3')).toMatchObject({ source: 'f2', isDotted: true })
  })

  it('caps every ring (>= 2) at SECOND_DEGREE_PER_NODE_MAX per parent', () => {
    // One 1st-degree parent with one 2nd-degree child; that 2nd-degree has
    // 5 friends-of-friends-of-friends, all clearing 70. Only 3 should make it.
    const viewer = makeUser('viewer', { connections: ['p1', 'p2', 'p3', 'p4', 'p5'] })
    const grandchildIds = Array.from({ length: 5 }, (_, i) => `g${i}`)
    const p1 = makeUser('p1', { connections: ['f1'] })
    const fillers = Array.from({ length: 4 }, (_, i) => makeUser(`p${i + 2}`))
    const f1 = makeUser('f1', { connections: grandchildIds })
    const grandchildren = grandchildIds.map((id) => makeUser(id))

    const scores: Record<string, number> = {
      p1: 90, p2: 85, p3: 84, p4: 83, p5: 82, f1: 80,
    }
    grandchildIds.forEach((id, i) => (scores[id] = 90 - i))

    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, p1, ...fillers, f1, ...grandchildren],
      scorer: scorerByMap(scores),
    })
    const thirdDegree = nodes.filter((n) => n.degree === 3)
    expect(thirdDegree).toHaveLength(3)
    expect(thirdDegree.map((n) => n.id)).toEqual(['g0', 'g1', 'g2'])
  })

  it('extends past 3rd-degree along a long chain (verifies the MAX_DEGREE loop, not a hardcoded 3)', () => {
    // Long single-thread chain: viewer -> a -> b -> c -> d. Every link is the
    // only connection in either direction, so each ring contains exactly one
    // node and the loop walks straight down. Verifies the algorithm does not
    // stop at degree 3 — it keeps going until MAX_DEGREE.
    const viewer = makeUser('viewer', { connections: ['a'] })
    const a = makeUser('a', { connections: ['b'] })
    const b = makeUser('b', { connections: ['c'] })
    const c = makeUser('c', { connections: ['d'] })
    const d = makeUser('d')

    const { nodes, edges } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, a, b, c, d],
      scorer: scorerByMap({ a: 90, b: 90, c: 90, d: 90 }),
    })

    // Every link is added; node degrees go 1, 2, 3, 4 (assumes MAX_DEGREE >= 4).
    expect(MAX_DEGREE).toBeGreaterThanOrEqual(4)
    expect(nodes.map((n) => ({ id: n.id, degree: n.degree }))).toEqual([
      { id: 'a', degree: 1 },
      { id: 'b', degree: 2 },
      { id: 'c', degree: 3 },
      { id: 'd', degree: 4 },
    ])
    // Bridge edges are dotted; the viewer->1st-degree edge is solid.
    const solidCount = edges.filter((edge) => !edge.isDotted).length
    expect(solidCount).toBe(1)
    expect(edges.length).toBe(4)
  })

  it('respects MAX_DEGREE: nothing beyond the cap is emitted', () => {
    // Chain of (MAX_DEGREE + 4) nodes so the dataset itself could go deeper
    // than the cap. Verifies the algorithm refuses to walk past MAX_DEGREE.
    const length = MAX_DEGREE + 4
    const ids = Array.from({ length }, (_, i) => `n${i}`)
    const users = ids.map((id, i) =>
      makeUser(id, { connections: i + 1 < ids.length ? [ids[i + 1]] : [] }),
    )
    const viewer = makeUser('viewer', { connections: [ids[0]] })
    const scores: Record<string, number> = {}
    ids.forEach((id) => (scores[id] = 90))

    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, ...users],
      scorer: scorerByMap(scores),
    })

    // MAX_DEGREE rings filled, one node each.
    expect(nodes).toHaveLength(MAX_DEGREE)
    const maxDegree = Math.max(...nodes.map((n) => n.degree))
    expect(maxDegree).toBe(MAX_DEGREE)
  })

  it('falls back to top-N grandchildren when none clear the 70 threshold (weak-match, ring 3)', () => {
    const viewer = makeUser('viewer', { connections: ['p1', 'p2', 'p3', 'p4', 'p5'] })
    const p1 = makeUser('p1', { connections: ['f1'] })
    const fillers = Array.from({ length: 4 }, (_, i) => makeUser(`p${i + 2}`))
    const f1 = makeUser('f1', { connections: ['g1', 'g2', 'g3', 'g4'] })

    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [
        viewer, p1, ...fillers, f1,
        makeUser('g1'), makeUser('g2'), makeUser('g3'), makeUser('g4'),
      ],
      scorer: scorerByMap({
        p1: 90, p2: 85, p3: 84, p4: 83, p5: 82, f1: 80,
        g1: 30, g2: 25, g3: 10, g4: 5,
      }),
    })
    const thirdDegree = nodes.filter((n) => n.degree === 3)
    expect(thirdDegree.map((n) => n.id)).toEqual(['g1', 'g2', 'g3'])
    expect(thirdDegree.every((n) => n.alignmentTier === 'weak')).toBe(true)
  })

  it('never surfaces a user already in the web at a deeper ring', () => {
    // `shared` is a 1st-degree connection (top-5 by score), AND would also
    // be reachable as 2nd-degree via p1 or 3rd-degree via p1 -> f1. The
    // uniqueness invariant means it appears once, at the SHALLOWEST ring
    // it qualifies for (degree 1).
    const viewer = makeUser('viewer', { connections: ['p1', 'p2', 'p3', 'p4', 'p5', 'shared'] })
    const p1 = makeUser('p1', { connections: ['f1', 'shared'] })
    const fillers = Array.from({ length: 4 }, (_, i) => makeUser(`p${i + 2}`))
    const f1 = makeUser('f1', { connections: ['shared'] })
    const shared = makeUser('shared')

    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, p1, ...fillers, f1, shared],
      // shared scores higher than the lowest filler so it secures a
      // 1st-degree slot.
      scorer: scorerByMap({
        p1: 99, p2: 85, p3: 84, p4: 83, p5: 60, shared: 88, f1: 80,
      }),
    })
    const sharedNodes = nodes.filter((n) => n.id === 'shared')
    expect(sharedNodes).toHaveLength(1)
    expect(sharedNodes[0].degree).toBe(1)
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
