'use client'

import type { KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import type { WebNode } from '@/types/web'
import { tierColor, tierRadius, truncateLabel, activityRingColor, activityRingLabel } from '@/lib/web/layout'

/**
 * Per-node visual decorations injected by sibling workflows. Workflow 1 owns the
 * plumbing (this prop + applying the marker class); the data and styling are
 * owned by the injecting workflow. `hasJobOverlap` is set by Workflow 4 (job
 * discovery) to flag connections that overlap with relevant job postings; when
 * true the marker gets the `node-job-overlap` class W4 styles into a pulsing ring.
 */
export interface NodeDecoration {
  hasJobOverlap?: boolean
}

export interface WebNodeMarkerProps {
  node: WebNode
  selected?: boolean
  onSelect?: (id: string) => void
  decoration?: NodeDecoration
}

// Caption length caps keep each node's name + headline narrower than the gap
// between adjacent nodes so labels never collide. The full text remains in the
// marker's `aria-label` for screen readers.
const NAME_MAX = 18
const HEADLINE_MAX = 22

// Presentational SVG marker for a single person node.
export default function WebNodeMarker({
  node,
  selected = false,
  onSelect,
  decoration,
}: WebNodeMarkerProps) {
  const r = tierRadius(node.alignmentTier)
  // The avatar ring encodes outreach-activity status (blue/amber/red). Falls back
  // to the alignment-tier colour for nodes that don't carry an activity status.
  const ring = node.activityStatus
    ? activityRingColor(node.activityStatus)
    : tierColor(node.alignmentTier)
  const activityTooltip = node.activityStatus ? activityRingLabel(node.activityStatus) : undefined
  const interactive = Boolean(onSelect)
  const hasJobOverlap = Boolean(decoration?.hasJobOverlap)

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect?.(node.id)
    }
  }

  return (
    <motion.g
      data-testid={`web-node-${node.id}`}
      className={hasJobOverlap ? 'node-job-overlap' : undefined}
      data-job-overlap={hasJobOverlap ? 'true' : undefined}
      role={interactive ? 'button' : undefined}
      aria-label={node.headline ? `${node.label}, ${node.headline}` : node.label}
      aria-pressed={interactive ? selected : undefined}
      tabIndex={interactive ? 0 : undefined}
      style={{ cursor: interactive ? 'pointer' : 'default', outline: 'none' }}
      onClick={interactive ? () => onSelect?.(node.id) : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      initial={{ opacity: 0, x: node.position.x, y: node.position.y, scale: 0.6 }}
      animate={{ opacity: 1, x: node.position.x, y: node.position.y, scale: 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
      whileHover={interactive ? { scale: 1.07 } : undefined}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      {/* Native hover tooltip describing the activity-ring nudge */}
      {activityTooltip && <title>{activityTooltip}</title>}

      {/* Selection halo — soft glow + ring (non-interactive so clicks reach the node) */}
      {selected && (
        <g style={{ pointerEvents: 'none' }}>
          <circle r={r + 11} fill={ring} opacity={0.12} />
          <circle r={r + 6} fill="none" stroke={ring} strokeWidth={2.5} opacity={0.55} />
        </g>
      )}

      {/* Avatar disc + alignment ring */}
      <circle r={r} fill="#eef3f8" stroke={ring} strokeWidth={selected ? 4 : 3} />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={r * 0.62}
        fontWeight={600}
        fill={ring}
      >
        {node.avatarInitials}
      </text>

      {/* 2nd-degree badge */}
      {node.degree === 2 && (
        <text x={r + 4} y={-r + 2} fontSize={10} fontWeight={600} fill="#8a94a6">
          2nd
        </text>
      )}

      {/* Name */}
      <text
        textAnchor="middle"
        y={r + 16}
        fontSize={12}
        fontWeight={600}
        fill="#1f2937"
      >
        {truncateLabel(node.label, NAME_MAX)}
      </text>

      {/* Headline */}
      {node.headline && (
        <text textAnchor="middle" y={r + 31} fontSize={10.5} fill="#6b7280">
          {truncateLabel(node.headline, HEADLINE_MAX)}
        </text>
      )}
    </motion.g>
  )
}
