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
  { id: 'e', name: 'Eve Polastri', degree: 2, via: 'b' },
  { id: 'f', name: 'Frank Castle', degree: 2, via: 'a' },
  { id: 'g', name: 'Gwen Stacy', degree: 2, via: 'a' },
  { id: 'z', name: 'Zoe Washburne', degree: 3, via: 'c' },
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

  it('shows only the selected connector’s 2nd-degree, collapsing the previous one', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    // a's child is shown; b's child is not.
    expect(s.snapshot.nodes.some((n) => n.id === 'c')).toBe(true)
    expect(s.snapshot.nodes.some((n) => n.id === 'e')).toBe(false)
    // Selecting b reveals b's child and drops a's child.
    s = reduce(s, { type: 'selectNode', id: 'b' })
    expect(s.snapshot.nodes.some((n) => n.id === 'e')).toBe(true)
    expect(s.snapshot.nodes.some((n) => n.id === 'c')).toBe(false)
  })

  it('selecting a 2nd-degree node keeps the web and just updates selection', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    s = reduce(s, { type: 'selectNode', id: 'c' })
    expect(s.selectedId).toBe('c')
    // The connector and its 2nd-degree node both remain on the canvas.
    expect(s.snapshot.nodes.some((n) => n.id === 'a')).toBe(true)
    expect(s.snapshot.nodes.some((n) => n.id === 'c')).toBe(true)
  })

  it('clears selection and resets', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'x' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    expect(reduce(s, { type: 'clearSelection' }).selectedId).toBeNull()
    expect(reduce(s, { type: 'reset' }).snapshot.state).toBe('empty')
  })

  it('connectNode solidifies the dotted bridge to a 2nd-degree person', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' }) // expands a -> reveals c via dotted bridge
    const bridgeId = 'a__c'
    expect(s.snapshot.edges.find((e) => e.id === bridgeId)?.isDotted).toBe(true)

    s = reduce(s, { type: 'connectNode', id: 'c' })
    const bridge = s.snapshot.edges.find((e) => e.id === bridgeId)!
    expect(s.connectedIds).toContain('c')
    expect(bridge.isDotted).toBe(false) // turns solid (blue)
    expect(bridge.strength).toBeGreaterThanOrEqual(0.9) // strengthened
  })

  it('keeps a connection solid after the connector is re-expanded', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    s = reduce(s, { type: 'connectNode', id: 'c' })
    // Visit b, then return to a (rebuilds a's expansion from scratch).
    s = reduce(s, { type: 'selectNode', id: 'b' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    expect(s.snapshot.edges.find((e) => e.id === 'a__c')?.isDotted).toBe(false)
  })

  it('connectNode is idempotent and resets on a new goal', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    s = reduce(s, { type: 'connectNode', id: 'c' })
    s = reduce(s, { type: 'connectNode', id: 'c' })
    expect(s.connectedIds).toEqual(['c'])
    // Mapping a new goal clears prior connections.
    s = reduce(s, { type: 'setGoalText', value: 'New goal' })
    s = reduce(s, { type: 'submitGoal' })
    expect(s.connectedIds).toEqual([])
  })

  it('expands a connected 2nd-degree node to reveal its 3rd-degree connections', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' }) // reveals c (2nd)
    s = reduce(s, { type: 'connectNode', id: 'c' }) // connect c
    s = reduce(s, { type: 'selectNode', id: 'c' }) // keep going: reveal z (3rd)
    expect(s.snapshot.nodes.some((n) => n.id === 'z')).toBe(true)
    expect(s.selectedId).toBe('c')
    expect(s.upgradePrompt).toBeNull()
    // Additive: the connector and its 2nd-degree node stay on the canvas.
    expect(s.snapshot.nodes.some((n) => n.id === 'a')).toBe(true)
    expect(s.snapshot.nodes.some((n) => n.id === 'c')).toBe(true)
  })

  it('does not expand a 2nd-degree node until the viewer connects with it', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    s = reduce(s, { type: 'selectNode', id: 'c' }) // not connected -> no expansion
    expect(s.snapshot.nodes.some((n) => n.id === 'z')).toBe(false)
    expect(s.selectedId).toBe('c')
    expect(s.upgradePrompt).toBeNull()
  })

  it('prompts to upgrade when expanding past the 3rd degree', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    s = reduce(s, { type: 'connectNode', id: 'c' })
    s = reduce(s, { type: 'selectNode', id: 'c' }) // reveal z (3rd)
    s = reduce(s, { type: 'connectNode', id: 'z' })
    s = reduce(s, { type: 'selectNode', id: 'z' }) // 3rd -> would reveal 4th: blocked
    expect(s.upgradePrompt).toBe('depth')
    expect(s.selectedId).toBe('z')
  })

  it('caps connections at the free-tier limit and prompts to upgrade', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'connectNode', id: 'c' })
    s = reduce(s, { type: 'connectNode', id: 'f' })
    s = reduce(s, { type: 'connectNode', id: 'g' })
    // 4th connection is blocked on the free tier.
    s = reduce(s, { type: 'connectNode', id: 'e' })
    expect(s.connectedIds).toEqual(['c', 'f', 'g'])
    expect(s.upgradePrompt).toBe('connection')
  })

  it('dismisses the upgrade prompt', () => {
    let s = reduce(createInitialBoardState(), { type: 'showUpgrade', reason: 'inmail' })
    expect(s.upgradePrompt).toBe('inmail')
    s = reduce(s, { type: 'dismissUpgrade' })
    expect(s.upgradePrompt).toBeNull()
  })
})
