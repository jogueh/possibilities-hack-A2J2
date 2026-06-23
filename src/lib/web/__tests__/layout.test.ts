import { describe, it, expect } from 'vitest'
import {
  layoutNodes,
  deriveEdges,
  tierColor,
  tierRadius,
  edgeStrokeWidth,
  edgeStrokeDasharray,
  TIER_COLORS,
} from '@/lib/web/layout'
import type { WebNode, DegreeLevel, AlignmentTier } from '@/types/web'

function node(
  id: string,
  degree: DegreeLevel,
  relevanceScore = 0.5,
  alignmentTier: AlignmentTier = 'moderate',
): WebNode {
  return {
    id,
    userId: `user_${id}`,
    label: id.toUpperCase(),
    degree,
    avatarInitials: id.slice(0, 2).toUpperCase(),
    alignmentTier,
    interactionScore: 0.4,
    relevanceScore,
    position: { x: 0, y: 0 },
  }
}

describe('tier styling', () => {
  it('maps each tier to a distinct colour', () => {
    expect(tierColor('strong')).toBe(TIER_COLORS.strong)
    expect(new Set(Object.values(TIER_COLORS)).size).toBe(3)
  })

  it('orders radii strong > moderate > weak', () => {
    expect(tierRadius('strong')).toBeGreaterThan(tierRadius('moderate'))
    expect(tierRadius('moderate')).toBeGreaterThan(tierRadius('weak'))
  })
})

describe('edge styling', () => {
  it('scales stroke width within [1, 5] and clamps out-of-range strength', () => {
    expect(edgeStrokeWidth(0)).toBe(1)
    expect(edgeStrokeWidth(1)).toBe(5)
    expect(edgeStrokeWidth(0.5)).toBe(3)
    expect(edgeStrokeWidth(-2)).toBe(1)
    expect(edgeStrokeWidth(9)).toBe(5)
  })

  it('only dotted edges get a dash array', () => {
    expect(edgeStrokeDasharray(true)).toBe('4 4')
    expect(edgeStrokeDasharray(false)).toBeUndefined()
  })
})

describe('layoutNodes', () => {
  const opts = { width: 800, height: 600, ring1Radius: 100, ring2Radius: 200 }

  it('places 1st-degree nodes on the inner ring and 2nd on the outer ring', () => {
    const out = layoutNodes([node('a', 1), node('b', 2)], opts)
    const a = out.find((n) => n.id === 'a')!
    const b = out.find((n) => n.id === 'b')!
    const dist = (n: WebNode) => Math.hypot(n.position.x - 400, n.position.y - 300)
    expect(Math.round(dist(a))).toBe(100)
    expect(Math.round(dist(b))).toBe(200)
  })

  it('puts the most relevant node at the top of its ring', () => {
    const out = layoutNodes(
      [node('low', 1, 0.1), node('high', 1, 0.9)],
      opts,
    )
    const high = out.find((n) => n.id === 'high')!
    // Top of the circle is center.y - radius.
    expect(high.position.x).toBeCloseTo(400, 1)
    expect(high.position.y).toBeCloseTo(200, 1)
  })

  it('is deterministic for the same input', () => {
    const input = [node('a', 1, 0.3), node('b', 1, 0.7), node('c', 2, 0.5)]
    expect(layoutNodes(input, opts)).toEqual(layoutNodes(input, opts))
  })
})

describe('deriveEdges', () => {
  const nodes = [node('a', 1), node('b', 1), node('c', 2)]

  it('marks edges touching a 2nd-degree node as dotted', () => {
    const edges = deriveEdges(
      [
        { source: 'a', target: 'b', strength: 0.8 },
        { source: 'b', target: 'c', strength: 0.4 },
      ],
      nodes,
    )
    const ab = edges.find((e) => e.id === 'a__b')!
    const bc = edges.find((e) => e.id === 'b__c')!
    expect(ab.isDotted).toBe(false)
    expect(bc.isDotted).toBe(true)
  })

  it('clamps strength and skips edges with unknown endpoints', () => {
    const edges = deriveEdges(
      [
        { source: 'a', target: 'b', strength: 5 },
        { source: 'a', target: 'ghost', strength: 0.5 },
      ],
      nodes,
    )
    expect(edges).toHaveLength(1)
    expect(edges[0].strength).toBe(1)
  })
})
