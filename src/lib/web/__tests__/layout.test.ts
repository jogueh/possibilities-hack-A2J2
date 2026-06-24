import { describe, it, expect } from 'vitest'
import {
  layoutNodes,
  deriveEdges,
  placeNearParent,
  resolveCollisions,
  NODE_MIN_DISTANCE,
  tierColor,
  tierRadius,
  truncateLabel,
  wrapLabel,
  wrapWords,
  edgeStrokeWidth,
  edgeStrokeDasharray,
  TIER_COLORS,
  ACTIVITY_RING_COLORS,
  ACTIVITY_RING_LABELS,
  activityRingColor,
  activityRingLabel,
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

describe('truncateLabel', () => {
  it('returns short text unchanged', () => {
    expect(truncateLabel('Bob Smith', 18)).toBe('Bob Smith')
  })

  it('truncates long text with a trailing ellipsis within the limit', () => {
    const out = truncateLabel('Product Manager at Tech Innovators Inc.', 22)
    expect(out.length).toBeLessThanOrEqual(22)
    expect(out.endsWith('…')).toBe(true)
  })

  it('handles degenerate limits', () => {
    expect(truncateLabel('anything', 0)).toBe('')
    expect(truncateLabel('anything', 1)).toBe('…')
  })
})

describe('wrapLabel', () => {
  it('keeps a short label on a single line', () => {
    expect(wrapLabel('Data Scientist', 16)).toEqual(['Data Scientist'])
  })

  it('wraps a long role onto multiple lines without dropping any words', () => {
    const lines = wrapLabel('Product Manager at Tech Innovators Inc.', 16)
    // Every line stays within the width budget...
    lines.forEach((line) => expect(line.length).toBeLessThanOrEqual(16))
    // ...and the full text is preserved (nothing truncated).
    expect(lines.join(' ')).toBe('Product Manager at Tech Innovators Inc.')
    expect(lines.length).toBeGreaterThan(1)
  })

  it('keeps a single over-long word whole on its own line', () => {
    expect(wrapLabel('Supercalifragilistic role', 10)).toEqual([
      'Supercalifragilistic',
      'role',
    ])
  })

  it('returns an empty list for blank text', () => {
    expect(wrapLabel('   ', 16)).toEqual([])
  })
})

describe('wrapWords', () => {
  it('wraps a role two words per line, preserving order', () => {
    expect(wrapWords('Product Manager at Tech Innovators Inc.', 2)).toEqual([
      'Product Manager',
      'at Tech',
      'Innovators Inc.',
    ])
  })

  it('keeps a short role on a single line', () => {
    expect(wrapWords('Data Scientist', 2)).toEqual(['Data Scientist'])
  })

  it('handles an odd word count by leaving a single word on the last line', () => {
    expect(wrapWords('Customer Service Manager', 2)).toEqual([
      'Customer Service',
      'Manager',
    ])
  })

  it('returns an empty list for blank text', () => {
    expect(wrapWords('   ', 2)).toEqual([])
  })
})

describe('resolveCollisions', () => {
  const minDist = NODE_MIN_DISTANCE

  const tooClose = (
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => Math.hypot(a.x - b.x, a.y - b.y) < minDist - 0.5

  it('pushes a candidate off an overlapping fixed point', () => {
    const fixed = [{ x: 100, y: 100 }]
    const [pos] = resolveCollisions(fixed, [{ x: 110, y: 100 }], minDist)
    expect(tooClose(pos, fixed[0])).toBe(false)
  })

  it('separates a cluster of candidates from each other and the obstacles', () => {
    const center = { x: 400, y: 300 }
    const fixed = [center, { x: 520, y: 300 }]
    // Three candidates intentionally stacked on the same point.
    const candidates = [
      { x: 560, y: 300 },
      { x: 560, y: 300 },
      { x: 560, y: 300 },
    ]
    const resolved = resolveCollisions(fixed, candidates, minDist, center)
    const all = [...fixed, ...resolved]
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(tooClose(all[i], all[j])).toBe(false)
      }
    }
  })

  it('leaves already-separated candidates effectively in place', () => {
    const fixed = [{ x: 0, y: 0 }]
    const cand = { x: 500, y: 500 }
    const [pos] = resolveCollisions(fixed, [cand], minDist)
    expect(pos).toEqual(cand)
  })

  it('is deterministic for the same input', () => {
    const fixed = [{ x: 400, y: 300 }]
    const candidates = [
      { x: 410, y: 300 },
      { x: 410, y: 300 },
    ]
    expect(resolveCollisions(fixed, candidates, minDist)).toEqual(
      resolveCollisions(fixed, candidates, minDist),
    )
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

describe('placeNearParent', () => {
  const opts = { width: 800, height: 600, ring1Radius: 100, ring2Radius: 200 }
  const center = { x: 400, y: 300 }

  it('places a child node near its parent, not on a global ring', () => {
    // Parent sits to the right of centre on the inner ring.
    const parent = { x: 500, y: 300 }
    const pos = placeNearParent(parent, center, 0, 1, opts)
    const distToParent = Math.hypot(pos.x - parent.x, pos.y - parent.y)
    const distToCenter = Math.hypot(pos.x - center.x, pos.y - center.y)
    // The child clusters close to the parent and further out than the parent.
    expect(distToParent).toBeLessThan(distToCenter)
    expect(distToCenter).toBeGreaterThan(
      Math.hypot(parent.x - center.x, parent.y - center.y),
    )
  })

  it('fans multiple children to distinct positions around the parent', () => {
    const parent = { x: 500, y: 300 }
    const a = placeNearParent(parent, center, 0, 3, opts)
    const b = placeNearParent(parent, center, 1, 3, opts)
    const c = placeNearParent(parent, center, 2, 3, opts)
    expect(a).not.toEqual(b)
    expect(b).not.toEqual(c)
    expect(a).not.toEqual(c)
  })

  it('is deterministic for the same input', () => {
    const parent = { x: 250, y: 450 }
    expect(placeNearParent(parent, center, 1, 4, opts)).toEqual(
      placeNearParent(parent, center, 1, 4, opts),
    )
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

describe('activity ring mapping', () => {
  it('maps each activity status to its ring colour', () => {
    expect(activityRingColor('active')).toBe('#3B82F6')
    expect(activityRingColor('moderate')).toBe('#F59E0B')
    expect(activityRingColor('inactive')).toBe('#EF4444')
    expect(activityRingColor('active')).toBe(ACTIVITY_RING_COLORS.active)
  })

  it('maps each activity status to its tooltip label', () => {
    expect(activityRingLabel('active')).toBe('Great time to reach out')
    expect(activityRingLabel('moderate')).toBe('Worth a nudge')
    expect(activityRingLabel('inactive')).toBe('Lead with shared context')
    expect(activityRingLabel('inactive')).toBe(ACTIVITY_RING_LABELS.inactive)
  })
})
