'use client'

import type { KeyboardEvent } from 'react'
import type { WebNode } from '@/types/web'
import { tierColor, tierRadius } from '@/lib/web/layout'

export interface WebNodeMarkerProps {
  node: WebNode
  selected?: boolean
  onSelect?: (id: string) => void
}

// Presentational SVG marker for a single person node.
export default function WebNodeMarker({
  node,
  selected = false,
  onSelect,
}: WebNodeMarkerProps) {
  const r = tierRadius(node.alignmentTier)
  const interactive = Boolean(onSelect)

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect?.(node.id)
    }
  }

  return (
    <g
      data-testid={`web-node-${node.id}`}
      transform={`translate(${node.position.x}, ${node.position.y})`}
      role={interactive ? 'button' : undefined}
      aria-label={node.label}
      aria-pressed={interactive ? selected : undefined}
      tabIndex={interactive ? 0 : undefined}
      style={{ cursor: interactive ? 'pointer' : 'default' }}
      onClick={interactive ? () => onSelect?.(node.id) : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
    >
      <circle
        r={r}
        fill={tierColor(node.alignmentTier)}
        stroke={selected ? '#004182' : '#ffffff'}
        strokeWidth={selected ? 3 : 2}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight={600}
        fill="#ffffff"
      >
        {node.avatarInitials}
      </text>
      <text
        textAnchor="middle"
        y={r + 14}
        fontSize={11}
        fill="#42526e"
      >
        {node.label}
      </text>
    </g>
  )
}
