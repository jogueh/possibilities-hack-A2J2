import type { WebEdge, WebNode } from '@/types/web'
import type { ParsedGoal } from '@/types/goal'
import type { UserWithJobs } from '@/types/data'
import {
  deriveAlignmentTier,
  scoreUserAgainstGoal as defaultScorer,
} from '@/lib/scoring'

// =============================================================================
// Web builder — pure function implementing the 8-step ranking algorithm from
// the W2 scope. Separated from the route handler so it can be exhaustively unit
// tested with an injected scoring function (the production route wires in the
// real one from `@/lib/scoring`).
// =============================================================================

export interface BuildWebInput {
  viewerUserId: string
  parsedGoal: ParsedGoal
  candidates: UserWithJobs[]
  /** Optional scorer override for tests. Defaults to the real `scoreUserAgainstGoal`. */
  scorer?: (user: UserWithJobs, goal: ParsedGoal) => number
}

export interface BuildWebOutput {
  nodes: WebNode[]
  edges: WebEdge[]
}

export const FIRST_DEGREE_MIN_SCORE = 40
export const FIRST_DEGREE_MAX = 5
export const SECOND_DEGREE_MIN_SCORE = 70
export const SECOND_DEGREE_PER_NODE_MAX = 3
export const DEFAULT_EDGE_STRENGTH = 50

interface ScoredUser {
  user: UserWithJobs
  score: number
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function companiesOf(user: UserWithJobs): Set<string> {
  return new Set(user.job_history.map((j) => j.company))
}

function skillsOf(user: UserWithJobs): Set<string> {
  return new Set(user.skills)
}

function shareSkillOrCompany(a: UserWithJobs, b: UserWithJobs): boolean {
  const aCompanies = companiesOf(a)
  for (const c of companiesOf(b)) if (aCompanies.has(c)) return true
  const aSkills = skillsOf(a)
  for (const s of skillsOf(b)) if (aSkills.has(s)) return true
  return false
}

function toNode(user: UserWithJobs, degree: 1 | 2, score: number): WebNode {
  return {
    id: user.id,
    userId: user.id,
    label: user.name,
    degree,
    avatarInitials: initialsFromName(user.name),
    alignmentTier: deriveAlignmentTier(score),
    // interactionScore starts at 0 per src/types/web.ts contract; W4 stretch
    // updates it client-side via the Zustand store.
    interactionScore: 0,
    relevanceScore: score,
    // Server emits placeholder positions — W1 owns the layout algorithm and
    // recomputes positions client-side when nodes change.
    position: { x: 0, y: 0 },
  }
}

function edge(source: string, target: string, isDotted: boolean): WebEdge {
  return {
    id: `${source}__${target}`,
    source,
    target,
    strength: DEFAULT_EDGE_STRENGTH,
    isDotted,
  }
}

/**
 * Builds the `{ nodes, edges }` payload for `POST /api/web/generate`. Implements
 * the 8-step algorithm from `plan/features/workflow-2-ai-data-layer/scope.md`:
 *
 *   1. Score every candidate against the parsed goal (viewer excluded by caller).
 *   2. Sort descending, take up to FIRST_DEGREE_MAX whose score >= FIRST_DEGREE_MIN_SCORE.
 *      No padding with weak matches — return fewer if fewer qualify.
 *   3. For each 1st-degree node, find up to SECOND_DEGREE_PER_NODE_MAX 2nd-degree
 *      candidates from the remaining pool with score >= SECOND_DEGREE_MIN_SCORE
 *      that ALSO share at least one skill or company with the 1st-degree node.
 *      A given user can appear at most once across the whole web.
 *   4. Emit solid edges from viewer -> 1st-degree, dotted edges from
 *      1st-degree -> 2nd-degree. All edges start at DEFAULT_EDGE_STRENGTH.
 */
export function buildWeb({
  viewerUserId,
  parsedGoal,
  candidates,
  scorer = defaultScorer,
}: BuildWebInput): BuildWebOutput {
  const pool = candidates.filter((u) => u.id !== viewerUserId)

  const scored: ScoredUser[] = pool
    .map((user) => ({ user, score: scorer(user, parsedGoal) }))
    .sort((a, b) => b.score - a.score)

  const firstDegree = scored
    .filter((s) => s.score >= FIRST_DEGREE_MIN_SCORE)
    .slice(0, FIRST_DEGREE_MAX)

  const firstDegreeIds = new Set(firstDegree.map((s) => s.user.id))
  const remaining = scored.filter((s) => !firstDegreeIds.has(s.user.id))

  const nodes: WebNode[] = firstDegree.map(({ user, score }) =>
    toNode(user, 1, score),
  )
  const edges: WebEdge[] = firstDegree.map(({ user }) =>
    edge(viewerUserId, user.id, false),
  )

  const usedSecondDegreeIds = new Set<string>()
  for (const parent of firstDegree) {
    const matches: ScoredUser[] = []
    for (const s of remaining) {
      if (matches.length >= SECOND_DEGREE_PER_NODE_MAX) break
      if (s.score < SECOND_DEGREE_MIN_SCORE) continue
      if (usedSecondDegreeIds.has(s.user.id)) continue
      if (!shareSkillOrCompany(parent.user, s.user)) continue
      matches.push(s)
    }
    for (const m of matches) {
      usedSecondDegreeIds.add(m.user.id)
      nodes.push(toNode(m.user, 2, m.score))
      edges.push(edge(parent.user.id, m.user.id, true))
    }
  }

  return { nodes, edges }
}
