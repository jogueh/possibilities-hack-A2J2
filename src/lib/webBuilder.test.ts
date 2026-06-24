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
    const scores: Record<string, number> = {}
    for (let i = 0; i < 10; i++) scores[`u${i}`] = 90 - i
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates,
      scorer: scorerByMap(scores),
    })
    const firstDegree = nodes.filter((n) => n.degree === 1)
    expect(firstDegree).toHaveLength(FIRST_DEGREE_MAX)
  })

  it('returns fewer than 5 when fewer candidates clear the 40 threshold (no padding)', () => {
    const candidates = [
      makeUser('u_strong'),
      makeUser('u_moderate'),
      makeUser('u_weak1'),
      makeUser('u_weak2'),
      makeUser('u_weak3'),
    ]
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates,
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

  it('excludes the requesting userId from the candidate pool', () => {
    const candidates = [
      makeUser('viewer', { name: 'The Viewer' }),
      makeUser('other', { name: 'Someone Else' }),
    ]
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates,
      scorer: scorerByMap({ viewer: 100, other: 80 }),
    })
    expect(nodes.find((n) => n.id === 'viewer')).toBeUndefined()
    expect(nodes.find((n) => n.id === 'other')).toBeDefined()
  })

  it('sorts 1st-degree nodes by descending score', () => {
    const candidates = [makeUser('a'), makeUser('b'), makeUser('c')]
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates,
      scorer: scorerByMap({ a: 50, b: 90, c: 70 }),
    })
    const firstDegree = nodes.filter((n) => n.degree === 1)
    expect(firstDegree.map((n) => n.id)).toEqual(['b', 'c', 'a'])
  })

  it('returns an empty payload when no candidates qualify', () => {
    const candidates = [makeUser('u1'), makeUser('u2')]
    const { nodes, edges } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates,
      scorer: scorerByMap({ u1: 10, u2: 0 }),
    })
    expect(nodes).toEqual([])
    expect(edges).toEqual([])
  })
})

describe('buildWeb — 2nd-degree selection', () => {
  it('emits 2nd-degree nodes only when score >= 70 AND share a skill or company with the parent', () => {
    const parent = makeUser('parent', {
      skills: ['React'],
      job_history: [
        {
          id: 'j1',
          company: 'Acme',
          location: 'SF',
          position: 'SWE',
          salary_range: { from: '', to: '' },
          industry: 'Technology',
          level: 'Mid',
          easy_apply: true,
          description: '',
        },
      ],
    })
    // Filler users fill the remaining 4 1st-degree slots so the candidates
    // below stay in the "remaining" pool and can compete for 2nd-degree.
    const fillers = Array.from({ length: 4 }, (_, i) =>
      makeUser(`f${i}`, { skills: ['UnrelatedSkill'] }),
    )
    const sharesSkill = makeUser('shares_skill', { skills: ['React'] })
    const sharesCompany = makeUser('shares_company', {
      job_history: [
        {
          id: 'j2',
          company: 'Acme',
          location: 'NYC',
          position: 'PM',
          salary_range: { from: '', to: '' },
          industry: 'Technology',
          level: 'Senior',
          easy_apply: false,
          description: '',
        },
      ],
    })
    const noOverlap = makeUser('no_overlap', { skills: ['Python'] })
    const tooWeak = makeUser('too_weak', { skills: ['React'] })

    const scores: Record<string, number> = {
      parent: 99,
      f0: 95,
      f1: 94,
      f2: 93,
      f3: 92,
      // These all score >= 70 but below the 1st-degree threshold, so they
      // remain available as 2nd-degree candidates.
      shares_skill: 80,
      shares_company: 75,
      no_overlap: 85,
      too_weak: 65,
    }
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [parent, ...fillers, sharesSkill, sharesCompany, noOverlap, tooWeak],
      scorer: scorerByMap(scores),
    })

    const secondDegreeIds = nodes
      .filter((n) => n.degree === 2)
      .map((n) => n.id)
      .sort()
    expect(secondDegreeIds).toEqual(['shares_company', 'shares_skill'])
  })

  it('caps 2nd-degree nodes per 1st-degree parent at 3', () => {
    const parent = makeUser('parent', { skills: ['X'] })
    const fillers = Array.from({ length: 4 }, (_, i) =>
      makeUser(`f${i}`, { skills: ['UnrelatedSkill'] }),
    )
    const children = Array.from({ length: 5 }, (_, i) =>
      makeUser(`c${i}`, { skills: ['X'] }),
    )
    const scores: Record<string, number> = { parent: 99 }
    fillers.forEach((_, i) => (scores[`f${i}`] = 90 + i)) // 90..93
    children.forEach((_, i) => (scores[`c${i}`] = 80)) // all 80 — qualify, but below fillers

    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [parent, ...fillers, ...children],
      scorer: scorerByMap(scores),
    })
    expect(nodes.filter((n) => n.degree === 2)).toHaveLength(3)
  })

  it('omits 2nd-degree for a parent when no candidate clears 70 with shared context', () => {
    const parent = makeUser('parent', { skills: ['React'] })
    const fillers = Array.from({ length: 4 }, (_, i) =>
      makeUser(`f${i}`, { skills: ['UnrelatedSkill'] }),
    )
    const candidate = makeUser('a', { skills: ['React'] })
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [parent, ...fillers, candidate],
      scorer: scorerByMap({
        parent: 99,
        f0: 95,
        f1: 94,
        f2: 93,
        f3: 92,
        a: 50, // shares skill, but fails the 70 threshold
      }),
    })
    expect(nodes.filter((n) => n.degree === 2)).toHaveLength(0)
  })

  it('a single user appears at most once across the whole web', () => {
    const parentA = makeUser('parentA', { skills: ['React'] })
    const parentB = makeUser('parentB', { skills: ['React'] })
    const fillers = Array.from({ length: 3 }, (_, i) =>
      makeUser(`f${i}`, { skills: ['UnrelatedSkill'] }),
    )
    const shared = makeUser('shared', { skills: ['React'] })
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [parentA, parentB, ...fillers, shared],
      scorer: scorerByMap({
        parentA: 99,
        parentB: 98,
        f0: 95,
        f1: 94,
        f2: 93,
        shared: 85,
      }),
    })
    const ids = nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    // `shared` becomes a 2nd-degree of whichever 1st-degree picked it first.
    expect(ids.filter((id) => id === 'shared')).toHaveLength(1)
  })
})

describe('buildWeb — edge wiring', () => {
  it('emits a solid edge from the viewer to each 1st-degree node', () => {
    const { edges } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [makeUser('a'), makeUser('b')],
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
    const parent = makeUser('parent', { skills: ['React'] })
    const fillers = Array.from({ length: 4 }, (_, i) =>
      makeUser(`f${i}`, { skills: ['UnrelatedSkill'] }),
    )
    const child = makeUser('child', { skills: ['React'] })
    const { edges } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [parent, ...fillers, child],
      scorer: scorerByMap({
        parent: 99,
        f0: 95,
        f1: 94,
        f2: 93,
        f3: 92,
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
    const { nodes } = buildWeb({
      viewerUserId: 'viewer',
      parsedGoal: goal,
      candidates: [
        makeUser('a', { name: 'Alice Anderson' }),
        makeUser('b', { name: 'Bob' }),
      ],
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
    const candidates = [makeUser('a'), makeUser('b'), makeUser('c')]
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
