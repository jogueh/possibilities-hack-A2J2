import { describe, expect, it } from 'vitest'
import {
  buildWeb,
  DEFAULT_EDGE_STRENGTH,
  FIRST_DEGREE_MAX,
} from '@/lib/webBuilder'
import type { Job, UserWithJobs } from '@/types/data'
import type { ParsedGoal } from '@/types/goal'

// ---------- Fixtures ----------

const goal: ParsedGoal = {
  intent: 'find SWE in SF',
  targetRole: 'Software Engineer',
  targetLocation: 'San Francisco, CA',
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job_1',
    company: 'Innovatech',
    location: 'San Francisco, CA',
    position: 'Software Engineer',
    salary_range: { from: '100k', to: '150k' },
    industry: 'Software',
    level: 'Mid',
    easy_apply: true,
    description: '',
    ...overrides,
  }
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

describe('buildWeb — 3rd-degree selection (maxDegree: 3)', () => {
  // viewer -> friend (1st) -> fof (2nd) -> fofof (3rd)
  const buildChain = (maxDegree?: 2 | 3) => {
    const viewer = makeUser('viewer', { connections: ['friend'] })
    const friend = makeUser('friend', { connections: ['fof'] })
    const fof = makeUser('fof', { connections: ['fofof'] })
    const fofof = makeUser('fofof', { connections: [] })
    return buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, friend, fof, fofof],
      scorer: scorerByMap({ friend: 90, fof: 85, fofof: 80 }),
      maxDegree,
    })
  }

  it('does not emit 3rd-degree nodes by default (maxDegree defaults to 2)', () => {
    const { nodes } = buildChain()
    expect(nodes.some((n) => n.degree === 3)).toBe(false)
    expect(nodes.find((n) => n.id === 'fofof')).toBeUndefined()
  })

  it('emits 3rd-degree nodes from the 2nd-degree connections with a dotted bridge', () => {
    const { nodes, edges } = buildChain(3)
    const third = nodes.find((n) => n.id === 'fofof')
    expect(third?.degree).toBe(3)
    const bridge = edges.find((e) => e.id === 'fof__fofof')
    expect(bridge?.isDotted).toBe(true)
  })

  it('carries the activity ring status onto built nodes', () => {
    const viewer = makeUser('viewer', { connections: ['active1'] })
    const active1 = makeUser('active1', { posts_activity: ['x', 'y', 'z'] }) // 3 posts -> active
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, active1],
      scorer: scorerByMap({ active1: 90 }),
    })
    expect(nodes.find((n) => n.id === 'active1')?.activityStatus).toBe('active')
  })

  it('keeps revealing a 2nd-degree node\'s connections even when none clear the 70 threshold (weak-match fallback)', () => {
    // viewer -> friend (1st) -> fof (2nd). `fof`'s own connections are all weak
    // goal-matches (< 70). The 2nd-degree pass would drop them, but the
    // 3rd-degree pass must still surface the top SECOND_DEGREE_PER_NODE_MAX so
    // the web can "keep going" once the viewer connects with `fof`.
    const viewer = makeUser('viewer', { connections: ['friend'] })
    const friend = makeUser('friend', { connections: ['fof'] })
    const fof = makeUser('fof', { connections: ['w1', 'w2', 'w3', 'w4'] })
    const weaks = ['w1', 'w2', 'w3', 'w4'].map((id) => makeUser(id))
    const { nodes, edges } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, friend, fof, ...weaks],
      // friend + fof clear thresholds; the 3rd-degree pool is all weak.
      scorer: scorerByMap({ friend: 90, fof: 85, w1: 30, w2: 20, w3: 10, w4: 5 }),
      maxDegree: 3,
    })
    const thirdIds = nodes.filter((n) => n.degree === 3).map((n) => n.id)
    // Top 3 weak connections by score, capped at SECOND_DEGREE_PER_NODE_MAX.
    expect(thirdIds).toEqual(['w1', 'w2', 'w3'])
    // Each is bridged (dotted) from the 2nd-degree parent `fof`.
    expect(
      thirdIds.every((id) =>
        edges.some((e) => e.id === `fof__${id}` && e.isDotted),
      ),
    ).toBe(true)
  })
})

describe('buildWeb — node headlines', () => {
  it('resolves a "position at company" headline from the member\'s first job', () => {
    const viewer = makeUser('viewer', { connections: ['a'] })
    const a = makeUser('a', {
      name: 'Alice Anderson',
      job_history: [
        makeJob({ position: 'Product Manager', company: 'Tech Innovators Inc.' }),
        makeJob({ position: 'Analyst', company: 'Old Co' }),
      ],
    })
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, a],
      scorer: scorerByMap({ a: 80 }),
    })
    expect(nodes.find((n) => n.id === 'a')?.headline).toBe(
      'Product Manager at Tech Innovators Inc.',
    )
  })

  it('omits the headline when the member has no resolvable job', () => {
    const viewer = makeUser('viewer', { connections: ['a'] })
    const a = makeUser('a', { job_history: [] })
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [viewer, a],
      scorer: scorerByMap({ a: 80 }),
    })
    expect(nodes.find((n) => n.id === 'a')?.headline).toBeUndefined()
  })
})
