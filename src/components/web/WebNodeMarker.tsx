'use client'

import type { KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import type { WebNode } from '@/types/web'
import { tierColor, tierRadius, truncateLabel, wrapWords, activityRingColor, activityRingLabel } from '@/lib/web/layout'

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

// The name caption stays on one line (capped width). The headline wraps two
// words per line so the full role is shown without overflowing the node's
// width. HEADLINE_MAX_LINES caps the vertical footprint of the headline
// caption — a 4+ line headline visually crashes into the next marker below
// it (the canvas's NODE_MIN_DISTANCE is sized for the disc + a 3-line
// caption with breathing room). Beyond the cap the last line is ellipsized.
const NAME_MAX = 18
const HEADLINE_WORDS_PER_LINE = 2
const HEADLINE_LINE_HEIGHT = 13
const HEADLINE_MAX_LINES = 3

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
  const baseLabel = node.headline ? `${node.label}, ${node.headline}` : node.label
  // Fold the activity nudge into the accessible name: the `<g>`'s aria-label
  // overrides the SVG `<title>`, so screen-reader users would otherwise miss the
  // ring's meaning that sighted users get from the hover tooltip.
  const ariaLabel = activityTooltip ? `${baseLabel}. ${activityTooltip}` : baseLabel
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
      aria-label={ariaLabel}
      aria-pressed={interactive ? selected : undefined}
      tabIndex={interactive ? 0 : undefined}
      style={{ cursor: interactive ? 'pointer' : 'default', outline: 'none' }}
      onClick={interactive ? () => onSelect?.(node.id) : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      initial={{ opacity: 0, x: node.position.x, y: node.position.y, scale: 0.6 }}
      animate={{ opacity: 1, x: node.position.x, y: node.position.y, scale: 1 }}
      exit={{
        opacity: 0,
        scale: 0.6,
        // Force a deterministic short fade so the marker fully reaches
        // opacity: 0 before AnimatePresence unmounts it. Without an explicit
        // exit transition, framer-motion inherits the parent's spring config
        // which can leave near-zero residue — visible as ghost name/headline
        // text after a snapshot rebuild collapses sibling suggestions
        // (especially when the diversified dataset has multiple users with
        // the same display name and the React key reuse blurs animation
        // boundaries).
        transition: { duration: 0.15, ease: 'easeIn' },
      }}
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

      {/* Avatar disc + activity-status ring (falls back to alignment-tier colour) */}
      <circle r={r} fill="#eef3f8" stroke={ring} strokeWidth={selected ? 4 : 3} />
      {/* Initials are the fallback shown when there's no photo (or it fails to load). */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={r * 0.62}
        fontWeight={600}
        fill={ring}
      >
        {node.avatarInitials}
      </text>
      {/* Avatar photo clipped to the disc, drawn over the initials fallback. */}
      {node.photo && (
        <>
          <clipPath id={`avatar-clip-${node.id}`}>
            <circle r={r} />
          </clipPath>
          <image
            href={node.photo}
            x={-r}
            y={-r}
            width={r * 2}
            height={r * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#avatar-clip-${node.id})`}
            style={{ pointerEvents: 'none' }}
          />
        </>
      )}

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

      {/* Headline — width-constrained: wraps two words per line so the full
          role (e.g. "Product Manager at Tech Innovators Inc.") fits the
          marker's column. Capped at HEADLINE_MAX_LINES to keep the caption's
          vertical footprint inside the disc-to-disc gap that
          NODE_MIN_DISTANCE budgets. Long roles get a trailing ellipsis. */}
      {node.headline &&
        wrapWords(node.headline, HEADLINE_WORDS_PER_LINE, HEADLINE_MAX_LINES).map(
          (line, i) => (
            <text
              key={i}
              textAnchor="middle"
              y={r + 31 + i * HEADLINE_LINE_HEIGHT}
              fontSize={10.5}
              fill="#6b7280"
            >
              {line}
            </text>
          ),
        )}
    </motion.g>
  )
}
