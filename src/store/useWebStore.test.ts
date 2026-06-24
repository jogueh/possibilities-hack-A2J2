import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebStore } from '@/store/useWebStore'
import type { WebEdge, WebNode } from '@/types/web'
import type { UserWithJobs } from '@/types/data'

const node = (id: string, over: Partial<WebNode> = {}): WebNode => ({
  id,
  userId: id,
  label: id,
  degree: 1,
  avatarInitials: id.slice(0, 2).toUpperCase(),
  alignmentTier: 'strong',
  interactionScore: 0,
  relevanceScore: 50,
  position: { x: 0, y: 0 },
  ...over,
})

const edge = (id: string, over: Partial<WebEdge> = {}): WebEdge => ({
  id,
  source: 'self',
  target: 'a',
  strength: 50,
  isDotted: false,
  ...over,
})

const resetStore = () =>
  useWebStore.setState({
    state: 'empty',
    goal: null,
    nodes: [],
    edges: [],
    viewerProfile: null,
  })

beforeEach(resetStore)

describe('useWebStore', () => {
  it('starts in the empty state with an empty snapshot', () => {
    const s = useWebStore.getState()
    expect(s.state).toBe('empty')
    expect(s.goal).toBeNull()
    expect(s.nodes).toEqual([])
    expect(s.edges).toEqual([])
    expect(s.viewerProfile).toBeNull()
  })

  it('walks the empty → seeded → expanded state machine', () => {
    expect(useWebStore.getState().state).toBe('empty')

    act(() => useWebStore.getState().seedWeb([node('a')], [edge('self__a')]))
    expect(useWebStore.getState().state).toBe('seeded')

    act(() =>
      useWebStore.getState().addSecondDegreeNode(node('b', { degree: 2 }), 'a'),
    )
    expect(useWebStore.getState().state).toBe('expanded')
  })

  it('setGoal stores the parsed goal', () => {
    act(() => useWebStore.getState().setGoal({ raw: 'Break into PM', userId: 'self' }))
    expect(useWebStore.getState().goal).toEqual({ raw: 'Break into PM', userId: 'self' })
  })

  it('resetWeb clears the snapshot but keeps the viewer profile', () => {
    const viewer = { id: 'self' } as unknown as UserWithJobs
    act(() => {
      useWebStore.getState().setViewerProfile(viewer)
      useWebStore.getState().setGoal({ raw: 'x', userId: 'self' })
      useWebStore.getState().seedWeb([node('a')], [edge('self__a')])
    })

    act(() => useWebStore.getState().resetWeb())

    const s = useWebStore.getState()
    expect(s.state).toBe('empty')
    expect(s.goal).toBeNull()
    expect(s.nodes).toEqual([])
    expect(s.edges).toEqual([])
    expect(s.viewerProfile).toBe(viewer)
  })

  describe('addSecondDegreeNode', () => {
    beforeEach(() => {
      act(() => useWebStore.getState().seedWeb([node('a')], [edge('self__a')]))
    })

    it('appends the node, a dotted bridge edge, and moves to expanded', () => {
      act(() =>
        useWebStore.getState().addSecondDegreeNode(node('b', { degree: 2 }), 'a'),
      )
      const s = useWebStore.getState()
      expect(s.state).toBe('expanded')
      expect(s.nodes.map((n) => n.id)).toEqual(['a', 'b'])
      const bridge = s.edges.find((e) => e.id === 'a__b')
      expect(bridge).toMatchObject({ source: 'a', target: 'b', isDotted: true, strength: 50 })
    })

    it('is idempotent on a duplicate node id', () => {
      const add = () =>
        act(() =>
          useWebStore.getState().addSecondDegreeNode(node('b', { degree: 2 }), 'a'),
        )
      add()
      const afterFirst = useWebStore.getState()
      add()
      const afterSecond = useWebStore.getState()

      expect(afterSecond.nodes).toHaveLength(2)
      expect(afterSecond.edges.filter((e) => e.id === 'a__b')).toHaveLength(1)
      // No new references created on the no-op call.
      expect(afterSecond.nodes).toBe(afterFirst.nodes)
      expect(afterSecond.edges).toBe(afterFirst.edges)
    })

    it('skips the bridge edge when the parent is not in the web', () => {
      act(() =>
        useWebStore.getState().addSecondDegreeNode(node('z', { degree: 2 }), 'ghost'),
      )
      const s = useWebStore.getState()
      expect(s.nodes.map((n) => n.id)).toContain('z')
      expect(s.edges.some((e) => e.id === 'ghost__z')).toBe(false)
    })
  })

  describe('updateInteractionScore', () => {
    beforeEach(() => {
      act(() =>
        useWebStore
          .getState()
          .seedWeb(
            [node('a', { interactionScore: 90 })],
            [edge('self__a', { strength: 90 })],
          ),
      )
    })

    it('increments both node score and edge strength', () => {
      act(() => useWebStore.getState().updateInteractionScore('a', 'self__a', 5))
      const s = useWebStore.getState()
      expect(s.nodes[0].interactionScore).toBe(95)
      expect(s.edges[0].strength).toBe(95)
    })

    it('clamps at the 100 ceiling', () => {
      act(() => useWebStore.getState().updateInteractionScore('a', 'self__a', 50))
      const s = useWebStore.getState()
      expect(s.nodes[0].interactionScore).toBe(100)
      expect(s.edges[0].strength).toBe(100)
    })

    it('clamps at the 0 floor', () => {
      act(() => useWebStore.getState().updateInteractionScore('a', 'self__a', -200))
      const s = useWebStore.getState()
      expect(s.nodes[0].interactionScore).toBe(0)
      expect(s.edges[0].strength).toBe(0)
    })
  })

  it('exposes a working selector hook (drop-in parity with the W3 mock)', () => {
    const { result } = renderHook(() => useWebStore((s) => s.nodes))
    expect(result.current).toEqual([])

    act(() => useWebStore.getState().seedWeb([node('a')], []))
    expect(result.current.map((n) => n.id)).toEqual(['a'])
  })
})
