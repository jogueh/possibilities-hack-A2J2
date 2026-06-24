import type { GoalQuery, WebSnapshot } from '@/types/web'
import type { LayoutOptions } from '@/lib/web/layout'
import {
  buildSnapshot,
  expandNode,
  type PersonInput,
} from '@/lib/web/snapshot'

// Pure state machine backing the WebBoard. Kept framework-free so the
// empty -> seeded -> expanded transitions and selection are unit-testable.

// Tie strength applied to a bridge edge once the viewer connects with the
// 2nd-degree person it reaches, so the (now solid) line reads as a strong link.
const CONNECTED_STRENGTH = 0.9

export type BoardStatus = 'idle' | 'loading' | 'error'

export interface BoardState {
  snapshot: WebSnapshot
  selectedId: string | null
  goalText: string
  /** Ids of people the viewer has connected with (dotted bridge -> solid link). */
  connectedIds: string[]
  /**
   * Ids of people the viewer has explicitly pinned to the canvas via
   * "Add to web". Their warm-path chain back to the viewer is re-applied
   * after every snapshot rebuild, so pinning preserves a 2nd-degree (or
   * deeper) node even when the viewer clicks a different 1st-degree
   * connector that would otherwise collapse this branch. Pinning is
   * orthogonal to connecting — you can pin a suggestion without committing
   * to connect with them.
   */
  pinnedIds: string[]
  /**
   * Resolved people for the current goal — populated from `/api/web/generate`
   * by the WebBoard. Empty until a goal is mapped. `selectNode` reads from
   * here so 2nd-degree expansion matches the goal-driven web rather than the
   * `config.people` fallback.
   */
  people: PersonInput[]
  status: BoardStatus
  error: string | null
}

export type BoardAction =
  | { type: 'setGoalText'; value: string }
  | { type: 'submitGoal' }
  | { type: 'mapStart' }
  | { type: 'submitGoalWithPeople'; people: PersonInput[] }
  | { type: 'mapError'; error: string }
  | { type: 'selectNode'; id: string }
  | { type: 'connectNode'; id: string }
  | { type: 'pinNode'; id: string }
  | { type: 'clearSelection' }
  | { type: 'reset' }

export interface BoardConfig {
  userId: string
  people: PersonInput[]
  options: LayoutOptions
}

export function createInitialBoardState(): BoardState {
  return {
    snapshot: { state: 'empty', nodes: [], edges: [], goal: null },
    selectedId: null,
    goalText: '',
    connectedIds: [],
    pinnedIds: [],
    people: [],
    status: 'idle',
    error: null,
  }
}

/**
 * Solidifies every dotted bridge edge that touches a connected person: the line
 * stops being dotted, turns into a strong link and is strengthened. Re-applied
 * after a snapshot rebuild so a connection survives re-expanding its connector.
 */
function applyConnections(
  snapshot: WebSnapshot,
  connectedIds: string[],
): WebSnapshot {
  if (connectedIds.length === 0) return snapshot
  const connected = new Set(connectedIds)
  const edges = snapshot.edges.map((e) =>
    e.isDotted && (connected.has(e.target) || connected.has(e.source))
      ? { ...e, isDotted: false, strength: Math.max(e.strength, CONNECTED_STRENGTH) }
      : e,
  )
  return { ...snapshot, edges }
}

/**
 * Re-applies the warm-path expansion needed to keep every pinned person on
 * the canvas after a snapshot rebuild. Pinning a depth-N node implicitly
 * pins their entire warm-path chain back to the viewer (you can't show a
 * 3rd-degree node without rendering the 2nd-degree connector that introduces
 * them) — `walkViaChain` produces that chain by following `via` references
 * up to the 1st-degree root, and the loop expands each ancestor in
 * shallowest-first order so each `expandNode` call has its parent already
 * in the snapshot.
 *
 * Idempotent and safe to call with an empty `pinnedIds` (no-op).
 */
function applyPins(
  snapshot: WebSnapshot,
  pinnedIds: string[],
  people: PersonInput[],
  options: LayoutOptions,
): WebSnapshot {
  if (pinnedIds.length === 0) return snapshot
  const byId = new Map(people.map((p) => [p.id, p]))
  let out = snapshot
  for (const pinnedId of pinnedIds) {
    const chain = walkViaChain(pinnedId, byId)
    // Expand each ancestor (shallowest -> just-before-pinned) so the pinned
    // node's parent is in the snapshot before we try to expand it. The pinned
    // node itself is revealed by expanding its direct parent; we don't need
    // to expand the pinned node unless we also want its children re-pinned,
    // which is the user's job (they'd pin those nodes too).
    for (const ancestor of chain.slice(0, -1)) {
      out = expandNode(out, ancestor, people, options)
    }
  }
  return out
}

/**
 * Walks a person's `via` chain from a 1st-degree root down to `id`. Returns
 * `[root, ..., id]` (length === person's degree). Returns `[id]` if the id
 * is itself a 1st-degree or unknown — in both cases there is nothing further
 * to expand to surface it on the canvas.
 */
function walkViaChain(
  id: string,
  byId: Map<string, PersonInput>,
): string[] {
  const chain: string[] = []
  let cursor: string | undefined = id
  // Cap iterations defensively in case of a circular via reference (data bug,
  // not user error). The realistic chain is bounded by MAX_DEGREE.
  for (let i = 0; cursor && i < 32; i++) {
    chain.unshift(cursor)
    const p = byId.get(cursor)
    if (!p || p.degree === 1 || !p.via) break
    cursor = p.via
  }
  return chain
}

// Picks the people list to feed the layout: real API-resolved people if the
// board has them (`submitGoalWithPeople` ran), otherwise the static fallback
// from config. This preserves existing test/demo behavior for callers that
// dispatch `submitGoal` directly without going through the API path.
function effectivePeople(state: BoardState, config: BoardConfig): PersonInput[] {
  return state.people.length > 0 ? state.people : config.people
}

export function boardReducer(
  state: BoardState,
  action: BoardAction,
  config: BoardConfig,
): BoardState {
  switch (action.type) {
    case 'setGoalText':
      return { ...state, goalText: action.value }

    case 'submitGoal': {
      const raw = state.goalText.trim()
      if (!raw) return state
      const goal: GoalQuery = { raw, userId: config.userId }
      const people = effectivePeople(state, config)
      return {
        ...state,
        snapshot: buildSnapshot(goal, people, config.options),
        selectedId: null,
        connectedIds: [],
        pinnedIds: [],
        status: 'idle',
        error: null,
      }
    }

    case 'mapStart':
      return { ...state, status: 'loading', error: null }

    case 'submitGoalWithPeople': {
      const raw = state.goalText.trim()
      if (!raw) return { ...state, status: 'idle' }
      const goal: GoalQuery = { raw, userId: config.userId }
      return {
        ...state,
        snapshot: buildSnapshot(goal, action.people, config.options),
        selectedId: null,
        connectedIds: [],
        pinnedIds: [],
        people: action.people,
        status: 'idle',
        error: null,
      }
    }

    case 'mapError':
      return { ...state, status: 'error', error: action.error }

    case 'selectNode': {
      const clicked = state.snapshot.nodes.find((n) => n.id === action.id)
      if (!clicked || !state.snapshot.goal) {
        return { ...state, selectedId: action.id }
      }

      const people = effectivePeople(state, config)
      let snapshot = state.snapshot
      if (clicked.degree === 1) {
        // Selecting a 1st-degree node reveals ONLY that connector's
        // 2nd-degree people, clustered next to it. 1st-degree IS the set of
        // real connections the viewer is already part of, so revealing the
        // suggestions reachable through them is always allowed. Rebuilding
        // from the seeded snapshot first collapses any other connector that
        // was previously expanded — but pinned warm paths (see `applyPins`
        // below) are then re-materialized so any explicitly retained
        // person survives the rebuild.
        const seeded = buildSnapshot(
          state.snapshot.goal,
          people,
          config.options,
        )
        snapshot = expandNode(seeded, action.id, people, config.options)
      } else if (state.connectedIds.includes(clicked.id)) {
        // Selecting a deeper node (2nd+) reveals its next-ring children IN
        // PLACE — but ONLY if the viewer has explicitly "connected" with that
        // node. Each ring beyond 1st-degree is a suggestion until the viewer
        // accepts the warm-path intro: connecting unlocks the next layer
        // of suggestions reachable through that person, mirroring real-world
        // network growth (you can't navigate a 3rd-degree intro until your
        // 2nd-degree connection introduces you).
        snapshot = expandNode(state.snapshot, action.id, people, config.options)
      }
      // For unconnected 2nd+ nodes, fall through with `snapshot = state.snapshot`
      // — selection still updates so the sidebar opens with the "Connect" CTA,
      // but the canvas does not reveal further suggestions until they accept.
      snapshot = applyPins(snapshot, state.pinnedIds, people, config.options)
      return {
        ...state,
        snapshot: applyConnections(snapshot, state.connectedIds),
        selectedId: action.id,
      }
    }

    case 'connectNode': {
      // Connecting reaches a 2nd+-degree person through their warm-path bridge:
      // record the link, turn the dotted bridge into a solid strengthened (blue)
      // edge, and unlock the next layer of suggestions reachable through them.
      // The next-layer reveal happens lazily on the next `selectNode` click on
      // that node — we do not eagerly expand here, so connecting is a clean
      // commitment action that the viewer can take without rearranging the
      // canvas. Idempotent — connecting again is a no-op.
      if (state.connectedIds.includes(action.id)) return state
      const connectedIds = [...state.connectedIds, action.id]
      return {
        ...state,
        connectedIds,
        snapshot: applyConnections(state.snapshot, connectedIds),
      }
    }

    case 'pinNode': {
      // Pinning retains a person on the canvas across snapshot rebuilds. The
      // pinned node (and its warm-path chain back to the viewer) is
      // re-materialized after every selectNode rebuild via `applyPins`, so a
      // click on another 1st-degree connector no longer collapses this branch.
      // Orthogonal to `connectNode`: pinning is a display preference and
      // requires no commitment from the viewer. Idempotent.
      if (state.pinnedIds.includes(action.id)) return state
      // 1st-degree nodes are always on the canvas regardless, so a pin there
      // is recorded but materially a no-op. We still store it so the UI can
      // reflect the pinned state and the action is consistently idempotent.
      return { ...state, pinnedIds: [...state.pinnedIds, action.id] }
    }

    case 'clearSelection':
      return { ...state, selectedId: null }

    case 'reset':
      return createInitialBoardState()

    default:
      return state
  }
}
