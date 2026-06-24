'use client'

import type { WebSnapshot } from '@/types/web'
import { edgeStrokeDasharray, edgeStrokeWidth } from '@/lib/web/layout'
import WebNodeMarker, { type NodeDecoration } from './WebNodeMarker'

export type { NodeDecoration }

export interface WebCanvasProps {
  snapshot: WebSnapshot
  width?: number
  height?: number
  selectedId?: string | null
  onNodeSelect?: (id: string) => void
  /**
   * Per-node decorations keyed by `WebNode.id`, injected by sibling workflows
   * (e.g. Workflow 4 sets `{ hasJobOverlap: true }` for connections that match
   * relevant jobs). Workflow 1 only routes them to the markers; the flag data
   * and ring styling are owned by the injecting workflow.
   */
  nodeDecorations?: Record<string, NodeDecoration>
}

const SELF_RADIUS = 30

// Presentational SVG renderer for a WebSnapshot: edges, the self centre, then nodes.
export default function WebCanvas({
  snapshot,
  width = 720,
  height = 520,
  selectedId = null,
  onNodeSelect,
  nodeDecorations,
}: WebCanvasProps) {
  const center = { x: width / 2, y: height / 2 }

  // Resolve any edge endpoint (a node id, or the self/goal id) to a point.
  const positionById = new Map<string, { x: number; y: number }>(
    snapshot.nodes.map((n) => [n.id, n.position]),
  )
  if (snapshot.goal) positionById.set(snapshot.goal.userId, center)

  return (
    <svg
      data-testid="web-canvas"
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={onNodeSelect ? 'group' : 'img'}
      aria-label="Connection web"
    >
      <g data-testid="web-edges">
        {snapshot.edges.map((edge) => {
          const a = positionById.get(edge.source)
          const b = positionById.get(edge.target)
          if (!a || !b) return null
          return (
            <line
              key={edge.id}
              data-testid={`web-edge-${edge.id}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={edge.isDotted ? '#b9c2cc' : '#4a90d9'}
              strokeWidth={edgeStrokeWidth(edge.strength)}
              strokeDasharray={edgeStrokeDasharray(edge.isDotted)}
              strokeLinecap="round"
            />
          )
        })}
      </g>

      {snapshot.goal && (
        <g data-testid="web-self" transform={`translate(${center.x}, ${center.y})`}>
          <circle r={SELF_RADIUS} fill="#0a66c2" stroke="#ffffff" strokeWidth={3} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={13}
            fontWeight={700}
            fill="#ffffff"
          >
            You
          </text>
        </g>
      )}

      <g data-testid="web-nodes">
        {snapshot.nodes.map((node) => (
          <WebNodeMarker
            key={node.id}
            node={node}
            selected={selectedId === node.id}
            onSelect={onNodeSelect}
            decoration={nodeDecorations?.[node.id]}
          />
        ))}
      </g>
    </svg>
  )
}
