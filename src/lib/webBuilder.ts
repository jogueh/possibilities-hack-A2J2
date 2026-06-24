import type { WebEdge, WebNode } from '@/types/web'
import type { ParsedGoal } from '@/types/goal'
import type { UserWithJobs } from '@/types/data'
import {
  deriveAlignmentTier,
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
 *   1a. COLD-START FALLBACK: if the viewer has no direct connections in the
 *       candidate set, seed the 1st-degree pool with structural suggestions
 *       from `suggestConnections(...)` (warm 2nd-degree, then hubs), then
 *       apply the same score / threshold / cap ranking on top. These are not
 *       real edges in the dataset, but the user still sees them as solid
 *       1st-degree edges in the UI — purely a discovery-floor for new users.
 *   2. 2nd-degree pool per 1st-degree node = that node's `connections`, minus
 *      the viewer and anyone already in the web. Score, filter
 *      >= SECOND_DEGREE_MIN_SCORE, sort desc, take top
 *      SECOND_DEGREE_PER_NODE_MAX. Edges 1st -> 2nd are DOTTED ("people to
 *      meet" via a warm path). A user appears at most once across the web.
 *   2a. WEAK-MATCH FALLBACK (mirrors 1a): if a 1st-degree parent has friends-
 *       of-friends in the candidate set but NONE clear the threshold (e.g.
 *       location-only goals that cap at ~30 points), surface the parent's
 *       top SECOND_DEGREE_PER_NODE_MAX by score anyway. Clicking a
 *       1st-degree node otherwise reveals no warm path for thin-signal goals.
 *       The alignmentTier on each node still conveys the weak match visually.
 *   3. No padding beyond the cold-start fallback. No edges to strangers
 *      outside the candidates set.
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

  // 1st-degree pool: the viewer's real connections present in the candidate
  // set. Cold-start fallback: if there are none (new / unknown viewer),
  // structural suggestions from `suggestConnections` seed the pool so the
  // user never sees a fully-empty web. These suggestions are goal-agnostic
  // and get ranked by score below — same threshold + cap as real connections.
  const viewerMember = byId.get(viewerUserId)
  let firstDegreePoolIds: string[] = [...connectionsOf(viewerUserId)]
  if (firstDegreePoolIds.length === 0) {
    firstDegreePoolIds = suggestConnections(
      viewerMember,
      byId,
      FIRST_DEGREE_MAX,
    )
  }

  const directScored: ScoredUser[] = []
  for (const id of firstDegreePoolIds) {
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
      candidateScored.push({ user, score: scorer(user, parsedGoal) })
    }
    candidateScored.sort((a, b) => b.score - a.score)

    // Strict path: keep only candidates clearing SECOND_DEGREE_MIN_SCORE.
    const qualifying = candidateScored.filter(
      (s) => s.score >= SECOND_DEGREE_MIN_SCORE,
    )
    // Weak-match fallback: when a parent has friends-of-friends but none clear
    // the threshold (e.g. a location-only goal that caps at ~30 points),
    // surface the top SECOND_DEGREE_PER_NODE_MAX anyway. Without this, clicking
    // a 1st-degree node never reveals a warm path for goals with thin scoring
    // signals. The alignmentTier on each surfaced node still reflects the
    // weak score so the UI's visual cue is intact. Threshold remains in effect
    // whenever the parent has at least one strong match — no weakening of the
    // rubric when good data is available.
    const picked =
      qualifying.length > 0
        ? qualifying.slice(0, SECOND_DEGREE_PER_NODE_MAX)
        : candidateScored.slice(0, SECOND_DEGREE_PER_NODE_MAX)
    for (const m of picked) {
      inWeb.add(m.user.id)
      nodes.push(toNode(m.user, 2, m.score))
      edges.push(edge(parent.user.id, m.user.id, true))
    }
  }

  return { nodes, edges }
}
