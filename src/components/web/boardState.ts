import type { GoalQuery, WebSnapshot } from '@/types/web'
import type { LayoutOptions } from '@/lib/web/layout'
import {
  buildSnapshot,
  expandNode,
  type PersonInput,
} from '@/lib/web/snapshot'

// Pure state machine backing the WebBoard. Kept framework-free so the
// empty -> seeded -> expanded transitions and selection are unit-testable.

export interface BoardState {
  snapshot: WebSnapshot
  selectedId: string | null
  goalText: string
}

export type BoardAction =
  | { type: 'setGoalText'; value: string }
  | { type: 'submitGoal' }
  | { type: 'selectNode'; id: string }
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
  }
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
      return {
        snapshot: buildSnapshot(goal, config.people, config.options),
        selectedId: null,
        goalText: state.goalText,
      }
    }

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
      const seeded = buildSnapshot(
        state.snapshot.goal,
        config.people,
        config.options,
      )
      const snapshot = expandNode(
        seeded,
        action.id,
        config.people,
        config.options,
      )
      return { ...state, snapshot, selectedId: action.id }
    }

    case 'clearSelection':
      return { ...state, selectedId: null }

    case 'reset':
      return createInitialBoardState()

    default:
      return state
  }
}
