import type { ActivityStatus, AlignmentTier, WebEdge, WebNode } from '@/types/web'

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

/**
 * Activity-status → ring colour. This is the "activity ring" shown around node
 * avatars: blue = active, amber = moderate, red = inactive.
 */
export const ACTIVITY_RING_COLORS: Record<ActivityStatus, string> = {
  active: '#3B82F6',
  moderate: '#F59E0B',
  inactive: '#EF4444',
}

/** Activity-status → hover tooltip copy (the outreach nudge). */
export const ACTIVITY_RING_LABELS: Record<ActivityStatus, string> = {
  active: 'Great time to reach out',
  moderate: 'Worth a nudge',
  inactive: 'Lead with shared context',
}

export function activityRingColor(status: ActivityStatus): string {
  return ACTIVITY_RING_COLORS[status]
}

export function activityRingLabel(status: ActivityStatus): string {
  return ACTIVITY_RING_LABELS[status]
}

/**
 * Truncates a label to `max` characters with a trailing ellipsis so node
 * captions (name / headline) keep a bounded width and never overlap their
 * neighbours on the canvas. The full text stays available for accessibility
 * (markers expose it via `aria-label`). Pure and deterministic.
 */
export function truncateLabel(text: string, max: number): string {
  if (max <= 0) return ''
  if (text.length <= max) return text
  if (max === 1) return '…'
  return `${text.slice(0, max - 1).trimEnd()}…`
}

/**
 * Word-wraps a label into lines no longer than `maxChars` characters each, so a
 * node caption (e.g. a full role like "Product Manager at Tech Innovators Inc.")
 * stays inside the node's width instead of being truncated — it flows onto the
 * next line whenever the next word would overflow. A single word longer than
 * `maxChars` is kept whole on its own line. Pure and deterministic.
 */
export function wrapLabel(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  if (maxChars <= 0) return [words.join(' ')]

  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (!line) {
      line = word
    } else if ((line + ' ' + word).length <= maxChars) {
      line += ' ' + word
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
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
  const ring1 = options.ring1Radius ?? minDim * 0.23
  const ring2 = options.ring2Radius ?? minDim * 0.46
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
  const ring1 = options.ring1Radius ?? minDim * 0.23
  // Distance the warm-path cluster sits beyond its parent. Tuned to clear the
  // parent's circle AND its caption so 2nd-degree nodes never overlap the
  // 1st-degree ring. When an explicit ring2 is supplied (tests / custom
  // layouts) we derive it from the ring gap; otherwise we use a fixed outward
  // distance scaled to the canvas.
  const clusterRadius = options.ring2Radius
    ? Math.max(80, (options.ring2Radius - ring1) * 0.9)
    : Math.max(120, minDim * 0.22)

  // Outward direction from the centre through the parent.
  const baseAngle = Math.atan2(parent.y - center.y, parent.x - center.x)
  // Narrow fan (~60°) keeps siblings radially outward instead of swinging them
  // sideways toward neighbouring 1st-degree nodes. A lone child sits directly
  // outward from the parent.
  const spread = Math.PI / 3
  const offset = count <= 1 ? 0 : (index / (count - 1) - 0.5) * spread
  const angle = baseAngle + offset

  return {
    x: round2(parent.x + clusterRadius * Math.cos(angle)),
    y: round2(parent.y + clusterRadius * Math.sin(angle)),
  }
}

/**
 * Builds styled WebEdges from raw relationships. An edge is dotted when its
 * endpoints sit on different rings (i.e. it crosses the warm-path frontier
 * between two adjacent degree levels). Same-ring or self↔1st-degree edges are
 * solid. Unknown endpoints are skipped.
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
    const isDotted = source.degree !== target.degree
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
