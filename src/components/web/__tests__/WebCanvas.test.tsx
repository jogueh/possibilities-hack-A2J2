import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import WebCanvas from '@/components/web/WebCanvas'
import { buildSnapshot, expandNode, type PersonInput } from '@/lib/web/snapshot'
import { alignmentColor } from '@/lib/alignmentColors'
import type { GoalQuery } from '@/types/web'

const options = { width: 720, height: 520, ring1Radius: 100, ring2Radius: 200 }
const goal: GoalQuery = { raw: 'Move into PM', userId: 'self_1' }
const people: PersonInput[] = [
  { id: 'a', name: 'Ada Lovelace', degree: 1, interactionScore: 0.9 },
  { id: 'b', name: 'Bob Smith', degree: 1, interactionScore: 0.4 },
  { id: 'c', name: 'Carol Danvers', degree: 2, via: 'a' },
]

afterEach(cleanup)

describe('WebCanvas', () => {
  it('renders nothing but the empty canvas with no goal', () => {
    const { container, queryByTestId } = render(
      <WebCanvas snapshot={buildSnapshot(null, people, options)} />,
    )
    expect(queryByTestId('web-canvas')).toBeTruthy()
    expect(queryByTestId('web-self')).toBeNull()
    expect(container.querySelectorAll('[data-testid^="web-node-"]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-testid^="web-edge-"]')).toHaveLength(0)
  })

  it('renders the self centre with no goal when alwaysShowSelf is set', () => {
    const { queryByTestId, getByText } = render(
      <WebCanvas snapshot={buildSnapshot(null, people, options)} alwaysShowSelf />,
    )
    expect(queryByTestId('web-self')).toBeTruthy()
    expect(getByText('You')).toBeTruthy()
  })

  it('renders the self centre, one marker and one edge per 1st-degree node', () => {
    const seeded = buildSnapshot(goal, people, options)
    const { container, getByTestId } = render(<WebCanvas snapshot={seeded} />)
    expect(getByTestId('web-self')).toBeTruthy()
    expect(container.querySelectorAll('[data-testid^="web-node-"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-testid^="web-edge-"]')).toHaveLength(2)
  })

  it('renders a clipped avatar photo for each member node', () => {
    const seeded = buildSnapshot(goal, people, options)
    const { container } = render(<WebCanvas snapshot={seeded} />)
    const node = container.querySelector('[data-testid="web-node-a"]')!
    const image = node.querySelector('image')
    expect(image?.getAttribute('href')).toBe(
      seeded.nodes.find((n) => n.id === 'a')!.photo,
    )
    expect(image?.getAttribute('clip-path')).toBe('url(#avatar-clip-a)')
    // Initials remain as the fallback beneath the photo.
    expect(node.textContent).toContain('AL')
  })

  it('styles a strong edge with a gradient stroke and a weak edge with a solid colour', () => {
    const seeded = buildSnapshot(goal, people, options)
    const { container } = render(<WebCanvas snapshot={seeded} />)
    // `a` has interactionScore 0.9 → strength 0.9 → vibrant tier (gradient stroke).
    const strongEdge = container.querySelector('[data-testid="web-edge-self_1__a"]')
    expect(strongEdge?.getAttribute('stroke')).toBe('url(#edge-grad-self_1__a)')
    expect(container.querySelector('#edge-grad-self_1__a')).toBeTruthy()
    // `b` has interactionScore 0.4 → steady tier → solid colour, no gradient def.
    const steadyEdge = container.querySelector('[data-testid="web-edge-self_1__b"]')
    expect(steadyEdge?.getAttribute('stroke')).not.toContain('url(#')
    expect(container.querySelector('#edge-grad-self_1__b')).toBeNull()
  })

  it('draws dotted bridge edges once a node is expanded', () => {
    const expanded = expandNode(buildSnapshot(goal, people, options), 'a', people, options)
    const { container } = render(<WebCanvas snapshot={expanded} />)
    expect(container.querySelectorAll('[data-testid^="web-node-"]')).toHaveLength(3)
    const dotted = Array.from(
      container.querySelectorAll<SVGLineElement>('[data-testid^="web-edge-"]'),
    ).filter((line) => line.getAttribute('stroke-dasharray'))
    expect(dotted).toHaveLength(1)
  })

  it('invokes onNodeSelect with the clicked node id', () => {
    const onNodeSelect = vi.fn()
    const seeded = buildSnapshot(goal, people, options)
    const { getByTestId } = render(
      <WebCanvas snapshot={seeded} onNodeSelect={onNodeSelect} />,
    )
    fireEvent.click(getByTestId('web-node-a'))
    expect(onNodeSelect).toHaveBeenCalledWith('a')
  })

  it('colors the node ring by alignment tier even when an activity status is set', () => {
    // A `weak` tier node with an `active` status would have rendered blue under
    // the old activity-first logic; the ring must now reflect goal-match strength
    // (grey) using the same alignmentColor palette as the sidebar.
    const seeded = buildSnapshot(goal, [
      { id: 'z', name: 'Zed Active', degree: 1, alignmentTier: 'weak', activityStatus: 'active' },
    ], options)
    const { getByTestId } = render(<WebCanvas snapshot={seeded} />)
    const avatar = getByTestId('web-node-z').querySelector('circle[fill="#eef3f8"]')
    expect(avatar?.getAttribute('stroke')).toBe(alignmentColor('weak'))
  })

  it('dedupes nodes with the same id (defensive against ghost markers)', () => {
    // Manually construct a snapshot with a duplicate id — should never
    // happen in practice (every emitter checks for existing ids before
    // adding) but if one slips through, AnimatePresence + React key reuse
    // would produce ghost text labels lingering after a snapshot rebuild.
    // Verify the canvas renders exactly one marker per unique id.
    const seeded = buildSnapshot(goal, people, options)
    const duped = {
      ...seeded,
      nodes: [...seeded.nodes, { ...seeded.nodes[0] }], // duplicate 'a'
    }
    const { container } = render(<WebCanvas snapshot={duped} />)
    expect(container.querySelectorAll('[data-testid="web-node-a"]')).toHaveLength(1)
  })
})
