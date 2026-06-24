import type {
  ActivityStatus,
  AlignmentTier,
  DegreeLevel,
  GoalQuery,
  WebEdge,
  WebNode,
  WebSnapshot,
} from '@/types/web'
import {
  deriveEdges,
  layoutNodes,
  placeNearParent,
  type LayoutOptions,
  type Relationship,
} from '@/lib/web/layout'
import { photoUrlForUser } from '@/lib/avatarPhoto'

// Snapshot builder: turns shaped people + a goal into a WebSnapshot and walks
// the empty -> seeded -> expanded state machine. Pure and deterministic.

export interface PersonInput {
  id: string
  name: string
  degree: DegreeLevel
  alignmentTier?: AlignmentTier
  interactionScore?: number
  relevanceScore?: number
  /** Optional headline (role at company) shown under the node name. */
  headline?: string
  /** Optional outreach-activity status driving the activity-ring colour. */
  activityStatus?: ActivityStatus
  /**
   * Optional avatar photo URL. When omitted, the snapshot derives a stable
   * portrait from the member id via `photoUrlForUser`.
   */
  photo?: string
  /**
   * Real member id in `user_data.json`, used by the node sidebar to fetch the
   * full profile. Defaults to `id` (the graph/layout id) when omitted.
   */
  userId?: string
  /** For 2nd-degree people: the 1st-degree connector (warm-path bridge) id. */
  via?: string
}

const DEFAULT_INTERACTION = 0.3
const DEFAULT_RELEVANCE = 0.5

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function alignmentFromScore(score: number): AlignmentTier {
  if (score >= 0.66) return 'strong'
  if (score >= 0.33) return 'moderate'
  return 'weak'
}

function toNode(p: PersonInput): WebNode {
  const relevanceScore = p.relevanceScore ?? DEFAULT_RELEVANCE
  return {
    id: p.id,
    userId: p.userId ?? p.id,
    label: p.name,
    degree: p.degree,
    avatarInitials: initialsFromName(p.name),
    alignmentTier: p.alignmentTier ?? alignmentFromScore(relevanceScore),
    interactionScore: p.interactionScore ?? DEFAULT_INTERACTION,
    relevanceScore,
    position: { x: 0, y: 0 },
    photo: p.photo ?? photoUrlForUser(p.userId ?? p.id),
    ...(p.headline ? { headline: p.headline } : {}),
    ...(p.activityStatus ? { activityStatus: p.activityStatus } : {}),
  }
}

function selfEdges(selfId: string, degree1: WebNode[]): WebEdge[] {
  return degree1.map((n) => ({
    id: `${selfId}__${n.id}`,
    source: selfId,
    target: n.id,
    strength: clamp01(n.interactionScore),
    isDotted: false,
  }))
}

const emptySnapshot = (goal: GoalQuery | null): WebSnapshot => ({
  state: 'empty',
  nodes: [],
  edges: [],
  goal,
})

/**
 * Builds the initial snapshot. With no goal the snapshot is `empty`; with a goal
 * it is `seeded` with the 1st-degree people laid out around the self centre.
 */
export function buildSnapshot(
  goal: GoalQuery | null,
  people: PersonInput[],
  options: LayoutOptions,
): WebSnapshot {
  if (!goal) return emptySnapshot(goal)

  const degree1 = layoutNodes(
    people.filter((p) => p.degree === 1).map(toNode),
    options,
  )

  return {
    state: 'seeded',
    nodes: degree1,
    edges: selfEdges(goal.userId, degree1),
    goal,
  }
}

/**
 * Adds a SINGLE specific person to the snapshot, placed next to their `via`
 * parent. Mirrors the positioning logic of `expandNode` but for one node only
 * — `expandNode` always reveals all of a parent's children, which is wrong
 * for the pinning UX (the viewer pins one suggestion but its siblings should
 * stay collapsed). No-op if the person is already in the snapshot, has no
 * `via` parent in the snapshot, or has no goal set.
 */
export function revealPerson(
  snapshot: WebSnapshot,
  person: PersonInput,
  options: LayoutOptions,
): WebSnapshot {
  if (!snapshot.goal) return snapshot
  if (snapshot.nodes.some((n) => n.id === person.id)) return snapshot
  if (!person.via) return snapshot
  const parent = snapshot.nodes.find((n) => n.id === person.via)
  if (!parent) return snapshot

  const center = { x: options.width / 2, y: options.height / 2 }
  const newNode: WebNode = {
    ...toNode(person),
    // Single child sits directly outward from the parent — matches the
    // expandNode lone-child layout (`count === 1` -> offset 0).
    position: placeNearParent(parent.position, center, 0, 1, options),
  }
  const nodes = [...snapshot.nodes, newNode]

  const relationships: Relationship[] = [
    {
      source: person.via,
      target: person.id,
      strength: person.interactionScore ?? DEFAULT_INTERACTION,
    },
  ]
  const bridgeEdges = deriveEdges(relationships, nodes)
  const existingEdgeIds = new Set(snapshot.edges.map((e) => e.id))
  const addedEdges = bridgeEdges.filter((e) => !existingEdgeIds.has(e.id))

  return {
    state: 'expanded',
    nodes,
    edges: [...snapshot.edges, ...addedEdges],
    goal: snapshot.goal,
  }
}

/**
 * Expands a node, revealing the next-ring people that reach the user through
 * it. Returns an `expanded` snapshot with dotted bridge edges. The new nodes
 * are clustered next to their connector (not on a global outer ring) so the
 * warm path reads clearly. Existing nodes keep their positions, so expanding
 * one node never reshuffles the rest of the web. Calling it for an unknown /
 * already-expanded node — or a node with no further children — is a no-op
 * (idempotent).
 *
 * Works at any depth: clicking a degree-N node reveals its degree-(N+1)
 * children whose `via` matches, one warm-path hop further out.
 */
export function expandNode(
  snapshot: WebSnapshot,
  nodeId: string,
  people: PersonInput[],
  options: LayoutOptions,
): WebSnapshot {
  if (!snapshot.goal) return snapshot

  const parent = snapshot.nodes.find((n) => n.id === nodeId)
  if (!parent) return snapshot

  // Children sit one ring further out than their parent.
  const childDegree: DegreeLevel = parent.degree + 1
  const existingIds = new Set(snapshot.nodes.map((n) => n.id))
  const newPeople = people.filter(
    (p) => p.degree === childDegree && p.via === nodeId && !existingIds.has(p.id),
  )
  if (newPeople.length === 0) {
    return snapshot
  }

  // Most relevant child sits first in the fan; deterministic id tie-break.
  const ordered = [...newPeople].sort(
    (a, b) =>
      (b.relevanceScore ?? DEFAULT_RELEVANCE) -
        (a.relevanceScore ?? DEFAULT_RELEVANCE) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )

  const center = { x: options.width / 2, y: options.height / 2 }
  const newNodes: WebNode[] = ordered.map((p, i) => ({
    ...toNode(p),
    position: placeNearParent(parent.position, center, i, ordered.length, options),
  }))
  const nodes = [...snapshot.nodes, ...newNodes]

  const relationships: Relationship[] = ordered.map((p) => ({
    source: p.via as string,
    target: p.id,
    strength: p.interactionScore ?? DEFAULT_INTERACTION,
  }))
  const bridgeEdges = deriveEdges(relationships, nodes)

  const existingEdgeIds = new Set(snapshot.edges.map((e) => e.id))
  const addedEdges = bridgeEdges.filter((e) => !existingEdgeIds.has(e.id))

  return {
    state: 'expanded',
    nodes,
    edges: [...snapshot.edges, ...addedEdges],
    goal: snapshot.goal,
  }
}
