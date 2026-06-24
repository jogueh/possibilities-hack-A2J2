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
  // 3rd-degree people reachable through 2nd-degree connectors.
  { id: 'd', name: 'Diana Prince', degree: 3, via: 'c' },
  { id: 'f', name: 'Fiona Glenanne', degree: 3, via: 'e' },
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

  it('selecting an UNCONNECTED 2nd-degree node keeps the web and does NOT reveal 3rd-degree', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    // 'c' is a 2nd-degree suggestion of 'a'. The viewer has NOT yet connected
    // with 'c', so clicking it should open the sidebar but the 3rd-degree
    // node 'd' (which would otherwise sit behind 'c') must stay hidden.
    s = reduce(s, { type: 'selectNode', id: 'c' })
    expect(s.selectedId).toBe('c')
    expect(s.snapshot.nodes.some((n) => n.id === 'a')).toBe(true)
    expect(s.snapshot.nodes.some((n) => n.id === 'c')).toBe(true)
    expect(s.snapshot.nodes.some((n) => n.id === 'd')).toBe(false)
  })

  it('selecting a CONNECTED 2nd-degree node reveals its 3rd-degree suggestions', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    // Connect to 'c' (lazy: snapshot does not yet show 3rd-degree).
    s = reduce(s, { type: 'connectNode', id: 'c' })
    expect(s.snapshot.nodes.some((n) => n.id === 'd')).toBe(false)
    // Now clicking 'c' should unlock its 3rd-degree connections.
    s = reduce(s, { type: 'selectNode', id: 'c' })
    expect(s.selectedId).toBe('c')
    expect(s.snapshot.nodes.some((n) => n.id === 'd')).toBe(true)
  })

  it('a deeper-ring click without connection only updates selection (gating is recursive)', () => {
    // Build a 1 -> 2 -> 3 chain by connecting to 'c', then clicking 'c' to
    // reveal 'd'. 'd' is now visible as a 3rd-degree suggestion. Clicking it
    // without first connecting must not reveal a hypothetical 4th-degree.
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    s = reduce(s, { type: 'connectNode', id: 'c' })
    s = reduce(s, { type: 'selectNode', id: 'c' }) // reveals 'd' at depth 3
    expect(s.snapshot.nodes.some((n) => n.id === 'd')).toBe(true)
    // Click 'd' without connecting. No deeper ring exists in fixtures, but the
    // assertion that matters: snapshot is identical (no rebuild, no removal).
    const nodesBefore = s.snapshot.nodes
    s = reduce(s, { type: 'selectNode', id: 'd' })
    expect(s.selectedId).toBe('d')
    expect(s.snapshot.nodes).toEqual(nodesBefore)
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

  it('promotes a connected 2nd-degree person to a permanent 1st-degree connection', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    s = reduce(s, { type: 'connectNode', id: 'c' })
    // Visiting another connector rebuilds the web; the connection must survive.
    s = reduce(s, { type: 'selectNode', id: 'b' })
    const c = s.snapshot.nodes.find((n) => n.id === 'c')
    expect(c).toBeTruthy()
    // c is now a direct (1st-degree) connection with a solid self-edge, not a
    // dotted warm-path bridge through a.
    expect(c?.degree).toBe(1)
    expect(s.snapshot.edges.find((e) => e.id === 'self_1__c')?.isDotted).toBe(false)
    expect(s.snapshot.edges.some((e) => e.id === 'a__c')).toBe(false)
  })

  it('converts a connected node to a 1st-degree connection on clearSelection', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    s = reduce(s, { type: 'connectNode', id: 'c' })
    // While still selected, c stays the 2nd-degree node (now with a solid bridge).
    expect(s.snapshot.nodes.find((n) => n.id === 'c')?.degree).toBe(2)
    // Clicking off promotes it to a permanent 1st-degree connection.
    s = reduce(s, { type: 'clearSelection' })
    expect(s.selectedId).toBeNull()
    const c = s.snapshot.nodes.find((n) => n.id === 'c')
    expect(c?.degree).toBe(1)
    expect(s.snapshot.edges.find((e) => e.id === 'self_1__c')?.isDotted).toBe(false)
  })

  it('keeps a promoted node navigable: its former 3rd-degree becomes a 2nd-degree suggestion', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    s = reduce(s, { type: 'connectNode', id: 'c' })
    s = reduce(s, { type: 'clearSelection' }) // c promoted to 1st-degree
    // d used to sit at depth 3 behind c. Now that c is a direct connection, d is
    // a 2nd-degree suggestion revealed by selecting c.
    s = reduce(s, { type: 'selectNode', id: 'c' })
    expect(s.snapshot.nodes.find((n) => n.id === 'd')?.degree).toBe(2)
  })

  it('a new goal clears the promotion', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    s = reduce(s, { type: 'connectNode', id: 'c' })
    s = reduce(s, { type: 'clearSelection' })
    expect(s.snapshot.nodes.find((n) => n.id === 'c')?.degree).toBe(1)
    // Mapping a new goal resets connections; c is a warm-path 2nd-degree node again.
    s = reduce(s, { type: 'setGoalText', value: 'New goal' })
    s = reduce(s, { type: 'submitGoal' })
    expect(s.connectedIds).toEqual([])
    s = reduce(s, { type: 'selectNode', id: 'a' })
    expect(s.snapshot.nodes.find((n) => n.id === 'c')?.degree).toBe(2)
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
})
