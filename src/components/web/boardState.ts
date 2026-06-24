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
        people: action.people,
        status: 'idle',
        error: null,
      }
    }

    case 'mapError':
      return { ...state, status: 'error', error: action.error }

    case 'selectNode': {
      const clicked = state.snapshot.nodes.find((n) => n.id === action.id)
      // Selecting a 2nd-degree node (or an unknown id) only changes the
      // selection — it must not collapse or rebuild the web.
      if (!clicked || clicked.degree !== 1 || !state.snapshot.goal) {
        return { ...state, selectedId: action.id }
      }

      // Selecting a 1st-degree node reveals ONLY that connector's 2nd-degree
      // people, clustered next to it. Rebuilding from the seeded snapshot first
      // collapses any other connector that was previously expanded, so the web
      // never shows a different person's warm path.
      const people = effectivePeople(state, config)
      const seeded = buildSnapshot(
        state.snapshot.goal,
        people,
        config.options,
      )
      const snapshot = expandNode(
        seeded,
        action.id,
        people,
        config.options,
      )
      return {
        ...state,
        snapshot: applyConnections(snapshot, state.connectedIds),
        selectedId: action.id,
      }
    }

    case 'connectNode': {
      // Connecting reaches a 2nd-degree person through their warm-path bridge:
      // record the link and turn that dotted bridge into a solid, strengthened
      // (blue) edge. Idempotent — connecting again is a no-op.
      if (state.connectedIds.includes(action.id)) return state
      const connectedIds = [...state.connectedIds, action.id]
      return {
        ...state,
        connectedIds,
        snapshot: applyConnections(state.snapshot, connectedIds),
      }
    }

    case 'clearSelection':
      return { ...state, selectedId: null }

    case 'reset':
      return createInitialBoardState()

    default:
      return state
  }
}
