import type { DegreeLevel, WebEdge, WebNode } from '@/types/web'
import type { ParsedGoal } from '@/types/goal'
import type { UserWithJobs } from '@/types/data'
import {
  deriveActivityStatus,
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
// The same threshold + per-parent cap apply to every ring BEYOND 1st-degree —
// the warm-path framing is identical at each hop (one more introduction step
// removed). Tighter caps would starve the canvas on thin-signal goals; looser
// caps would explode it (per-parent fan-out compounds geometrically with depth).
export const SECOND_DEGREE_MIN_SCORE = 70
export const SECOND_DEGREE_PER_NODE_MAX = 3
// Hard ceiling on warm-path depth. 4 keeps the canvas readable: with the
// per-parent cap of SECOND_DEGREE_PER_NODE_MAX=3 and FIRST_DEGREE_MAX=5, the
// worst case is ~5 + 15 + 45 + 135 = 200 nodes. Pushing further explodes the
// node count geometrically (depth 6 ~= 1500 nodes on a dense graph) and the
// "warm path" framing breaks down past 3-4 introduction hops anyway. Loop
// supports arbitrary depth — bump this constant if a richer canvas can
// handle the density.
export const MAX_DEGREE = 4
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

// Builds the "role at company" headline shown under a node from the member's
// most recent job. Returns undefined when the member has no job history so the
// node simply renders without a role line.
function headlineOf(user: UserWithJobs): string | undefined {
  const job = user.job_history?.[0]
  if (!job) return undefined
  return job.company ? `${job.position} at ${job.company}` : job.position
}

function toNode(user: UserWithJobs, degree: DegreeLevel, score: number): WebNode {
  const headline = headlineOf(user)
  return {
    id: user.id,
    userId: user.id,
    label: user.name,
    degree,
    avatarInitials: initialsFromName(user.name),
    alignmentTier: deriveAlignmentTier(score),
    // The activity ring (blue/amber/red) is derived from the member's recent
    // posting cadence so the canvas conveys "good time to reach out" at a glance.
    activityStatus: deriveActivityStatus(user),
    // interactionScore starts at 0 per src/types/web.ts contract; W4 stretch
    // updates it client-side via the Zustand store.
    interactionScore: 0,
    relevanceScore: score,
    // Server emits placeholder positions — W1 owns the layout algorithm and
    // recomputes positions client-side when nodes change.
    position: { x: 0, y: 0 },
    ...(headline ? { headline } : {}),
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
 *   2. Ring N for N in [2..MAX_DEGREE]: each node in ring N-1 acts as a
 *      parent. Its `connections` (minus everyone already in the web)
 *      become the ring-N candidates, scored against the goal, filtered to
 *      >= SECOND_DEGREE_MIN_SCORE, sorted desc, capped at
 *      SECOND_DEGREE_PER_NODE_MAX. Edges across the ring boundary are
 *      DOTTED ("warm-path introduction"). A user appears at most once
 *      across the whole web.
 *   2a. WEAK-MATCH FALLBACK (mirrors 1a): if a parent in ring N-1 has
 *       candidates in the dataset but NONE clear the threshold, surface its
 *       top SECOND_DEGREE_PER_NODE_MAX by score anyway. Clicking a node
 *       otherwise reveals no warm path for thin-signal goals at deeper
 *       rings. The alignmentTier on each surfaced node still conveys the
 *       weak match visually.
 *   2b. Expansion stops early when a ring yields zero new nodes — every
 *       reachable person is already on the canvas; no need to keep iterating.
 *   3. No edges to strangers outside the candidates set.
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

  // Tracks every userId already placed in the web so a user appears at most
  // once across all rings.
  const inWeb = new Set<string>([viewerUserId, ...firstDegree.map((s) => s.user.id)])

  // Frontier-expansion loop: at depth N, every node in the previous ring acts
  // as a parent. Its `connections` (minus everyone already in the web) become
  // the depth-(N+1) candidates, ranked + capped by the same warm-path rules
  // as 2nd-degree. The loop terminates either at MAX_DEGREE or when a depth
  // yields no new nodes (every reachable person is already on the canvas).
  let frontier: ScoredUser[] = firstDegree
  for (let depth = 2; depth <= MAX_DEGREE; depth++) {
    const nextFrontier: ScoredUser[] = []
    for (const parent of frontier) {
      const candidateScored: ScoredUser[] = []
      for (const id of connectionsOf(parent.user.id)) {
        if (inWeb.has(id)) continue
        const user = byId.get(id)
        if (!user) continue
        candidateScored.push({ user, score: scorer(user, parsedGoal) })
      }
      candidateScored.sort((a, b) => b.score - a.score)

      // Strict path: keep only candidates clearing the threshold.
      const qualifying = candidateScored.filter(
        (s) => s.score >= SECOND_DEGREE_MIN_SCORE,
      )
      // Weak-match fallback: when a parent has friends-of-friends but none
      // clear the threshold (e.g. location-only goals that cap at ~30 points),
      // surface the top SECOND_DEGREE_PER_NODE_MAX anyway so deep expansion
      // is never starved on thin-signal goals. Threshold remains binding
      // whenever the parent has at least one strong match.
      const picked =
        qualifying.length > 0
          ? qualifying.slice(0, SECOND_DEGREE_PER_NODE_MAX)
          : candidateScored.slice(0, SECOND_DEGREE_PER_NODE_MAX)
      for (const m of picked) {
        inWeb.add(m.user.id)
        nodes.push(toNode(m.user, depth, m.score))
        edges.push(edge(parent.user.id, m.user.id, true))
        nextFrontier.push(m)
      }
    }
    if (nextFrontier.length === 0) break
    frontier = nextFrontier
  }

  return { nodes, edges }
}
