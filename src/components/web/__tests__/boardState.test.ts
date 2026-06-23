import { describe, it, expect } from 'vitest'
import {
  boardReducer,
  createInitialBoardState,
  type BoardConfig,
} from '@/components/web/boardState'
import type { PersonInput } from '@/lib/web/snapshot'

const people: PersonInput[] = [
  { id: 'a', name: 'Ada Lovelace', degree: 1 },
  { id: 'b', name: 'Bob Smith', degree: 1 },
  { id: 'c', name: 'Carol Danvers', degree: 2, via: 'a' },
]

const config: BoardConfig = {
  userId: 'self_1',
  people,
  options: { width: 720, height: 520 },
}

const reduce = (s: ReturnType<typeof createInitialBoardState>, a: Parameters<typeof boardReducer>[1]) =>
  boardReducer(s, a, config)

describe('boardReducer', () => {
  it('starts empty', () => {
    expect(createInitialBoardState().snapshot.state).toBe('empty')
  })

  it('ignores submitGoal when the goal text is blank', () => {
    const s = reduce(createInitialBoardState(), { type: 'setGoalText', value: '   ' })
    expect(reduce(s, { type: 'submitGoal' }).snapshot.state).toBe('empty')
  })

  it('seeds the web when a goal is submitted', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    expect(s.snapshot.state).toBe('seeded')
    expect(s.snapshot.nodes.map((n) => n.id).sort()).toEqual(['a', 'b'])
    expect(s.snapshot.goal?.raw).toBe('Become a PM')
    expect(s.selectedId).toBeNull()
  })

  it('expands and selects a 1st-degree node on selectNode', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    expect(s.snapshot.state).toBe('expanded')
    expect(s.selectedId).toBe('a')
    expect(s.snapshot.nodes.some((n) => n.id === 'c')).toBe(true)
  })

  it('clears selection and resets', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'x' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    expect(reduce(s, { type: 'clearSelection' }).selectedId).toBeNull()
    expect(reduce(s, { type: 'reset' }).snapshot.state).toBe('empty')
  })
})
