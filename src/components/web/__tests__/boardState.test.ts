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

  it('logMeetup strengthens the edge to a 1st-degree person to full strength', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    const selfEdgeId = 'self_1__a'
    expect(s.snapshot.edges.find((e) => e.id === selfEdgeId)!.strength).toBeLessThan(1)

    s = reduce(s, { type: 'logMeetup', id: 'a' })
    expect(s.metUpIds).toContain('a')
    expect(s.snapshot.edges.find((e) => e.id === selfEdgeId)!.strength).toBe(1)
  })

  it('logMeetup does not strengthen non-viewer edges touching the met-up person', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    s = reduce(s, { type: 'connectNode', id: 'c' })
    const bridgeBefore = s.snapshot.edges.find((e) => e.id === 'a__c')!
    expect(bridgeBefore.isDotted).toBe(false)
    expect(bridgeBefore.strength).toBeLessThan(1)

    s = reduce(s, { type: 'logMeetup', id: 'a' })
    expect(s.snapshot.edges.find((e) => e.id === 'self_1__a')!.strength).toBe(1)
    expect(s.snapshot.edges.find((e) => e.id === 'a__c')!.strength).toBe(bridgeBefore.strength)
  })

  it('keeps a meetup-strengthened edge after the web is re-expanded', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'logMeetup', id: 'a' })
    // Visit b (rebuilds the seeded snapshot) then return to a.
    s = reduce(s, { type: 'selectNode', id: 'b' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    expect(s.snapshot.edges.find((e) => e.id === 'self_1__a')!.strength).toBe(1)
  })

  it('logMeetup is idempotent and resets on a new goal', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'logMeetup', id: 'a' })
    s = reduce(s, { type: 'logMeetup', id: 'a' })
    expect(s.metUpIds).toEqual(['a'])
    s = reduce(s, { type: 'setGoalText', value: 'New goal' })
    s = reduce(s, { type: 'submitGoal' })
    expect(s.metUpIds).toEqual([])
  })

  it('keeps outgoing warm-path bridges from a connected node dotted until that further person also connects', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    // Reveal c (2nd degree) through a (1st degree), then connect with c.
    s = reduce(s, { type: 'selectNode', id: 'a' })
    s = reduce(s, { type: 'connectNode', id: 'c' })
    // The bridge INTO the connected node solidifies (dotted -> solid/blue).
    expect(s.snapshot.edges.find((e) => e.id === 'a__c')?.isDotted).toBe(false)
    // Expanding the connected node reveals its 3rd-degree child d.
    s = reduce(s, { type: 'selectNode', id: 'c' })
    const cToD = s.snapshot.edges.find((e) => e.id === 'c__d')
    // d isn't connected yet, so the OUTGOING bridge from c stays a dotted
    // suggestion (regression guard: it must not auto-solidify just because its
    // source c is connected).
    expect(cToD).toBeDefined()
    expect(cToD?.isDotted).toBe(true)
  })

  it('logMeetup flags the connection line into a met-up person as purple (isMetUp)', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    // Reveal c through a, connect with c, then log a meetup with c.
    s = reduce(s, { type: 'selectNode', id: 'a' })
    s = reduce(s, { type: 'connectNode', id: 'c' })
    s = reduce(s, { type: 'logMeetup', id: 'c' })
    // The line INTO c (its warm-path bridge) is flagged met-up and solid.
    const intoC = s.snapshot.edges.find((e) => e.id === 'a__c')!
    expect(intoC.isMetUp).toBe(true)
    expect(intoC.isDotted).toBe(false)
    // A normal (not-met-up) connection line stays unflagged (renders blue).
    const intoA = s.snapshot.edges.find((e) => e.id === 'self_1__a')!
    expect(intoA.isMetUp).toBeFalsy()
  })

  it('logMeetup does not flag outgoing edges FROM a met-up person', () => {
    let s = reduce(createInitialBoardState(), { type: 'setGoalText', value: 'Become a PM' })
    s = reduce(s, { type: 'submitGoal' })
    s = reduce(s, { type: 'selectNode', id: 'a' })
    s = reduce(s, { type: 'logMeetup', id: 'a' })
    // a__c has a (met-up) as its source, not target — it must not turn purple.
    const outFromA = s.snapshot.edges.find((e) => e.id === 'a__c')
    expect(outFromA?.isMetUp).toBeFalsy()
    // a's own connection line (self -> a) is the one that turns purple.
    expect(s.snapshot.edges.find((e) => e.id === 'self_1__a')!.isMetUp).toBe(true)
  })
})
