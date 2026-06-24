import type { DegreeLevel, WebEdge, WebNode } from '@/types/web'
import type { ParsedGoal } from '@/types/goal'
import type { UserWithJobs } from '@/types/data'
import {
  deriveAlignmentTier,
  deriveActivityStatus,
  scoreUserAgainstGoal as defaultScorer,
} from '@/lib/scoring'
import { suggestConnections } from '@/lib/connections'

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
  /**
   * Deepest degree to emit. Defaults to 2 (1st + 2nd degree) so existing
   * callers/tests are unchanged; the live route passes 3 so the viewer can
   * "keep going" past the 2nd-degree frontier once they connect.
   */
  maxDegree?: 2 | 3
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

function toNode(user: UserWithJobs, degree: DegreeLevel, score: number): WebNode {
  return {
    id: user.id,
    userId: user.id,
    label: user.name,
    degree,
    avatarInitials: initialsFromName(user.name),
    alignmentTier: deriveAlignmentTier(score),
    // The activity ring (blue/amber/red) is derived from the member's real
    // post activity so the live web matches the demo palette.
    activityStatus: deriveActivityStatus(user),
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
 *   1a. WEAK-MATCH FALLBACK: if the viewer HAS connections but none clear
 *       the threshold, we still show the top FIRST_DEGREE_MAX of their
 *       connections by score. The threshold is only a quality filter for
 *       1st-degree when the viewer has at least one strong match — without
 *       this fallback a goal like "find people in SF" (location-only signal,
 *       caps at ~30 points) would render an empty web even though the user
 *       has connections. The `alignmentTier` on each node already conveys
 *       the weak match visually.
 *   1b. COLD-START FALLBACK: if the viewer has NO direct connections in the
 *       candidate set (new / unknown viewer), seed the 1st-degree pool with
 *       structural suggestions from `suggestConnections(...)` (warm 2nd-
 *       degree, then hubs). The score threshold IS enforced on this path so
 *       we don't recommend irrelevant strangers — these aren't real edges.
 *   2. 2nd-degree pool per 1st-degree node = that node's `connections`, minus
 *      the viewer and anyone already in the web. Score, filter
 *      >= SECOND_DEGREE_MIN_SCORE, sort desc, take top
 *      SECOND_DEGREE_PER_NODE_MAX. Edges 1st -> 2nd are DOTTED ("people to
 *      meet" via a warm path). A user appears at most once across the web.
 *   3. No edges to strangers outside the candidates set.
 */
export function buildWeb({
  viewerUserId,
  parsedGoal,
  candidates,
  scorer = defaultScorer,
  maxDegree = 2,
}: BuildWebInput): BuildWebOutput {
  // O(1) candidate lookup by userId.
  const byId = new Map<string, UserWithJobs>()
  for (const u of candidates) byId.set(u.id, u)

  // Reads the connections array off a candidate; unknown ids return [].
  const connectionsOf = (id: string): readonly string[] =>
    byId.get(id)?.connections ?? []

  // 1st-degree pool starts as the viewer's real direct connections. Cold-start
  // (`isColdStart`) only fires when there are NONE — in that case suggestions
  // from `suggestConnections` seed the pool and the score threshold is treated
  // as binding (don't show irrelevant strangers).
  const viewerMember = byId.get(viewerUserId)
  const directIds = connectionsOf(viewerUserId)
  const isColdStart = directIds.length === 0
  const firstDegreePoolIds: string[] = isColdStart
    ? suggestConnections(viewerMember, byId, FIRST_DEGREE_MAX)
    : [...directIds]

  const directScored: ScoredUser[] = []
  for (const id of firstDegreePoolIds) {
    if (id === viewerUserId) continue
    const user = byId.get(id)
    if (!user) continue
    directScored.push({ user, score: scorer(user, parsedGoal) })
  }
  directScored.sort((a, b) => b.score - a.score)

  // Strict path: filter to scores clearing the threshold, then cap at MAX.
  const qualifying = directScored.filter(
    (s) => s.score >= FIRST_DEGREE_MIN_SCORE,
  )
  // Weak-match fallback only fires for the real-connections path: if at
  // least one connection clears the threshold OR we're on the cold-start
  // path (where the suggestions are strangers, so weak matches should be
  // dropped), keep the strict result. Otherwise, surface the viewer's
  // top-MAX connections by score so the web isn't empty.
  const firstDegree =
    qualifying.length > 0 || isColdStart
      ? qualifying.slice(0, FIRST_DEGREE_MAX)
      : directScored.slice(0, FIRST_DEGREE_MAX)

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
  const secondDegree: ScoredUser[] = []
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
      secondDegree.push(m)
      nodes.push(toNode(m.user, 2, m.score))
      edges.push(edge(parent.user.id, m.user.id, true))
    }
  }

  // 3rd-degree: one hop further out from each 2nd-degree node, so the viewer can
  // "keep going" past the warm-path frontier once they connect. Same ranking +
  // threshold as the 2nd-degree pass; dotted edges from the 2nd-degree parent.
  // Only emitted when the caller opts into a deeper web (`maxDegree >= 3`).
  if (maxDegree >= 3) {
    for (const parent of secondDegree) {
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
        nodes.push(toNode(m.user, 3, m.score))
        edges.push(edge(parent.user.id, m.user.id, true))
      }
    }
  }

  return { nodes, edges }
}
