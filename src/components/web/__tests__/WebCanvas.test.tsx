import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import WebCanvas from '@/components/web/WebCanvas'
import { buildSnapshot, expandNode, type PersonInput } from '@/lib/web/snapshot'
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

  it('renders the self centre, one marker and one edge per 1st-degree node', () => {
    const seeded = buildSnapshot(goal, people, options)
    const { container, getByTestId } = render(<WebCanvas snapshot={seeded} />)
    expect(getByTestId('web-self')).toBeTruthy()
    expect(container.querySelectorAll('[data-testid^="web-node-"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-testid^="web-edge-"]')).toHaveLength(2)
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
})
