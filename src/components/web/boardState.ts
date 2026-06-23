import type { GoalQuery, WebSnapshot } from '@/types/web'
import type { LayoutOptions } from '@/lib/web/layout'
import { buildSnapshot, expandNode, type PersonInput } from '@/lib/web/snapshot'

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
      const snapshot = expandNode(
        state.snapshot,
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
