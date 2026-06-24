import type { AlignmentTier, WebEdge, WebNode } from '@/types/web'

// Pure, deterministic geometry + styling helpers for the Graph Canvas.
// No React / DOM imports here so this module is trivially unit-testable.

export interface LayoutOptions {
  width: number
  height: number
  /** Radius of the inner ring that holds 1st-degree nodes. */
  ring1Radius?: number
  /** Radius of the outer ring that holds 2nd-degree nodes. */
  ring2Radius?: number
}

export interface Relationship {
  source: string
  target: string
  /** Normalised tie strength in the range [0, 1]. */
  strength: number
}

/** Alignment-tier → node fill colour (LinkedIn-inspired palette). */
export const TIER_COLORS: Record<AlignmentTier, string> = {
  strong: '#0a66c2',
  moderate: '#3b8f4f',
  weak: '#8c8c8c',
}

/** Alignment-tier → node circle radius (px). */
export const TIER_RADIUS: Record<AlignmentTier, number> = {
  strong: 30,
  moderate: 26,
  weak: 22,
}

export function tierColor(tier: AlignmentTier): string {
  return TIER_COLORS[tier]
}

export function tierRadius(tier: AlignmentTier): number {
  return TIER_RADIUS[tier]
}

const round2 = (n: number): number => Math.round(n * 100) / 100

const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n))

/** Maps a tie strength (0..1) to an SVG stroke width between 1 and 5 px. */
export function edgeStrokeWidth(strength: number): number {
  return round2(1 + clamp(strength, 0, 1) * 4)
}

/** SVG stroke-dasharray for an edge ('4 4' when dotted, otherwise undefined). */
export function edgeStrokeDasharray(isDotted: boolean): string | undefined {
  return isDotted ? '4 4' : undefined
}

/**
 * Places nodes deterministically on concentric rings keyed by degree.
 * 1st-degree nodes sit on the inner ring, 2nd-degree on the outer ring.
 * Within a ring, nodes are ordered by relevanceScore (desc) then id (asc) so
 * the most relevant person sits at the top and the layout is stable.
 */
export function layoutNodes(nodes: WebNode[], options: LayoutOptions): WebNode[] {
  const { width, height } = options
  const minDim = Math.min(width, height)
  const ring1 = options.ring1Radius ?? minDim * 0.22
  const ring2 = options.ring2Radius ?? minDim * 0.4
  const center = { x: width / 2, y: height / 2 }

  const place = (group: WebNode[], radius: number): WebNode[] => {
    const ordered = [...group].sort(
      (a, b) =>
        b.relevanceScore - a.relevanceScore ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    const count = Math.max(ordered.length, 1)
    return ordered.map((node, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / count
      return {
        ...node,
        position: {
          x: round2(center.x + radius * Math.cos(angle)),
          y: round2(center.y + radius * Math.sin(angle)),
        },
      }
    })
  }

  return [
    ...place(nodes.filter((n) => n.degree === 1), ring1),
    ...place(nodes.filter((n) => n.degree === 2), ring2),
  ]
}

/**
 * Places a 2nd-degree node in a small cluster around its 1st-degree parent,
 * fanned out along the outward direction (centre → parent) so warm-path nodes
 * sit visually next to the connector that introduces them instead of being
 * spread across a global outer ring. Pure and deterministic.
 */
export function placeNearParent(
  parent: { x: number; y: number },
  center: { x: number; y: number },
  index: number,
  count: number,
  options: LayoutOptions,
): { x: number; y: number } {
  const minDim = Math.min(options.width, options.height)
  const clusterRadius = options.ring2Radius
    ? Math.max(48, (options.ring2Radius - (options.ring1Radius ?? minDim * 0.22)) * 0.8)
    : minDim * 0.16

  // Outward direction from the centre through the parent.
  const baseAngle = Math.atan2(parent.y - center.y, parent.x - center.x)
  // Total fan width (~80°); a lone child sits directly outward from the parent.
  const spread = Math.PI / 2.2
  const offset = count <= 1 ? 0 : (index / (count - 1) - 0.5) * spread
  const angle = baseAngle + offset

  return {
    x: round2(parent.x + clusterRadius * Math.cos(angle)),
    y: round2(parent.y + clusterRadius * Math.sin(angle)),
  }
}

/**
 * Builds styled WebEdges from raw relationships. An edge is dotted when either
 * endpoint is a 2nd-degree node (i.e. it crosses into the warm-path frontier).
 * Unknown endpoints are skipped.
 */
export function deriveEdges(
  relationships: Relationship[],
  nodes: WebNode[],
): WebEdge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return relationships.flatMap((rel) => {
    const source = byId.get(rel.source)
    const target = byId.get(rel.target)
    if (!source || !target) return []
    const isDotted = source.degree === 2 || target.degree === 2
    return [
      {
        id: `${rel.source}__${rel.target}`,
        source: rel.source,
        target: rel.target,
        strength: clamp(rel.strength, 0, 1),
        isDotted,
      },
    ]
  })
}
