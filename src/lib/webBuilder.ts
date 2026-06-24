import type { WebEdge, WebNode } from '@/types/web'
import type { ParsedGoal } from '@/types/goal'
import type { UserWithJobs } from '@/types/data'
import {
  deriveAlignmentTier,
  scoreUserAgainstGoal as defaultScorer,
} from '@/lib/scoring'

// =============================================================================
// Web builder — pure function implementing the connection-graph-aware ranking
// algorithm. Separated from the route handler so it can be exhaustively unit
// tested with an injected scoring function. Connection data is read directly
// off each candidate's `connections: string[]` field (carried through from
// `User` via `UserWithJobs`), so there is no separate graph dependency.
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
 * Builds the `{ nodes, edges }` payload for `POST /api/web/generate`. The web
 * reflects the viewer's REAL network ranked by goal — it is no longer a
 * goal-scored slice of the entire dataset.
 *
 *   1. 1st-degree pool = `viewer.connections` resolved against the candidates
 *      map (anyone outside the candidates set is silently dropped). Score
 *      each, keep score >= FIRST_DEGREE_MIN_SCORE, sort desc, take top
 *      FIRST_DEGREE_MAX. Edges viewer -> 1st are SOLID (real connection).
 *   2. 2nd-degree pool per 1st-degree node = that node's `connections`, minus
 *      the viewer and anyone already in the web. Score, filter
 *      >= SECOND_DEGREE_MIN_SCORE, sort desc, take top
 *      SECOND_DEGREE_PER_NODE_MAX. Edges 1st -> 2nd are DOTTED ("people to
 *      meet" via a warm path). A user appears at most once across the web.
 *   3. No padding — return fewer nodes if fewer qualify. No edges to strangers.
 */
export function buildWeb({
  viewerUserId,
  parsedGoal,
  candidates,
  scorer = defaultScorer,
}: BuildWebInput): BuildWebOutput {
  // O(1) candidate lookup by userId.
  const byId = new Map<string, UserWithJobs>()
  for (const u of candidates) byId.set(u.id, u)

  // Reads the connections array off a candidate; unknown ids return [].
  const connectionsOf = (id: string): readonly string[] =>
    byId.get(id)?.connections ?? []

  // 1st-degree: viewer's direct connections that exist in the candidate set
  // AND clear the score threshold.
  const directScored: ScoredUser[] = []
  for (const id of connectionsOf(viewerUserId)) {
    if (id === viewerUserId) continue
    const user = byId.get(id)
    if (!user) continue
    const score = scorer(user, parsedGoal)
    if (score < FIRST_DEGREE_MIN_SCORE) continue
    directScored.push({ user, score })
  }
  directScored.sort((a, b) => b.score - a.score)
  const firstDegree = directScored.slice(0, FIRST_DEGREE_MAX)

  const nodes: WebNode[] = firstDegree.map(({ user, score }) =>
    toNode(user, 1, score),
  )
  const edges: WebEdge[] = firstDegree.map(({ user }) =>
    edge(viewerUserId, user.id, false),
  )

  // Tracks every userId already placed in the web (viewer + 1st-degree +
  // 2nd-degree as they are added) so a user appears at most once.
  const inWeb = new Set<string>([viewerUserId, ...firstDegree.map((s) => s.user.id)])

  // 2nd-degree: friends-of-friends per 1st-degree node, ranked by goal score.
  for (const parent of firstDegree) {
    const candidateScored: ScoredUser[] = []
    for (const id of connectionsOf(parent.user.id)) {
      if (inWeb.has(id)) continue
      const user = byId.get(id)
      if (!user) continue
      const score = scorer(user, parsedGoal)
      if (score < SECOND_DEGREE_MIN_SCORE) continue
      candidateScored.push({ user, score })
    }
    candidateScored.sort((a, b) => b.score - a.score)
    const picked = candidateScored.slice(0, SECOND_DEGREE_PER_NODE_MAX)
    for (const m of picked) {
      inWeb.add(m.user.id)
      nodes.push(toNode(m.user, 2, m.score))
      edges.push(edge(parent.user.id, m.user.id, true))
    }
  }

  return { nodes, edges }
}
