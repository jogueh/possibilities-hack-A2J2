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
// Per-parent cap on warm-path fan-out at every ring beyond 1st-degree.
// Tighter caps would starve the canvas on thin-signal goals; looser caps
// would explode it (per-parent fan-out compounds geometrically with depth).
// The min-score threshold that used to gate this ring was removed: with
// stricter scoring the threshold dropped real warm-path candidates whose
// score was a few points shy of arbitrary cutoffs; the per-parent cap is
// sufficient to keep the canvas readable. The alignment ring colour on
// each node conveys match quality visually instead.
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
 *      each, sort by score desc, take top FIRST_DEGREE_MAX. Edges
 *      viewer -> 1st are SOLID (real connection). The score threshold is
 *      INFORMATIONAL only — every direct connection is eligible for the
 *      canvas because the goal re-ranks the viewer's actual network rather
 *      than narrowing it down. The alignment ring colour on each node
 *      (strong/moderate/weak) conveys match quality visually. Without this,
 *      a precise goal that only one connection scores well on would collapse
 *      the canvas to that single person, breaking the "this is my network"
 *      mental model.
 *   1a. COLD-START PATH: if the viewer has NO direct connections in the
 *       candidate set (new / unknown viewer), seed the 1st-degree pool with
 *       structural suggestions from `suggestConnections(...)` (warm 2nd-
 *       degree, then hubs). The FIRST_DEGREE_MIN_SCORE threshold IS
 *       enforced on this path so we don't recommend irrelevant strangers
 *       — these aren't real edges.
 *   2. Ring N for N in [2..MAX_DEGREE]: each node in ring N-1 acts as a
 *      parent. Its `connections` (minus everyone already in the web)
 *      become the ring-N candidates, scored against the goal, sorted by
 *      score desc, capped at SECOND_DEGREE_PER_NODE_MAX per parent. Edges
 *      across the ring boundary are DOTTED ("warm-path introduction").
 *      A user appears at most once across the whole web. The score is
 *      again informational at this hop — gating warm-path introductions
 *      on a hard threshold would prevent the viewer from discovering
 *      reachable people whose alignment is weak but real.
 *   2a. Expansion stops early when a ring yields zero new nodes — every
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

  // Real-connections path: always surface up to FIRST_DEGREE_MAX of the
  // viewer's direct connections, ranked by goal alignment. The alignment
  // ring colour on each node (strong/moderate/weak) is what conveys the
  // match quality visually — filtering weak connections OUT of the canvas
  // would collapse the viewer's network to "just the one person who
  // matches", breaking the "this is my network, re-ranked" mental model.
  //
  // Cold-start path (no real connections) DOES enforce the threshold
  // strictly: those candidates are stranger suggestions, so showing weak
  // matches would be noise, not network context.
  const firstDegree = isColdStart
    ? directScored
        .filter((s) => s.score >= FIRST_DEGREE_MIN_SCORE)
        .slice(0, FIRST_DEGREE_MAX)
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

      // Warm-path expansion: same logic as 1st-degree — every reachable
      // friend-of-friend of `parent` is fair game for the canvas, ranked
      // by goal alignment. The alignment ring colour conveys match quality
      // visually; filtering weak matches out at depth N collapses the
      // warm-path tree to "only the matches", which (a) breaks the
      // mental model that this is the viewer's actual reachable network
      // and (b) starves deeper expansion since the next ring needs
      // parents to expand from. Per-parent cap of
      // SECOND_DEGREE_PER_NODE_MAX still keeps the canvas readable.
      const picked = candidateScored.slice(0, SECOND_DEGREE_PER_NODE_MAX)
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
