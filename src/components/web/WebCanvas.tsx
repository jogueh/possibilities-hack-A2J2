'use client'

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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
const MIN_ZOOM = 0.6
const MAX_ZOOM = 3
const ZOOM_STEP = 1.2

const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n))

interface ViewTransform {
  tx: number
  ty: number
  k: number
}

// Presentational SVG renderer for a WebSnapshot: edges, the self centre, then
// nodes. Supports click-drag panning and wheel / button zooming so the web stays
// readable as it grows.
export default function WebCanvas({
  snapshot,
  width = 720,
  height = 520,
  selectedId = null,
  onNodeSelect,
  nodeDecorations,
}: WebCanvasProps) {
  const center = { x: width / 2, y: height / 2 }
  const svgRef = useRef<SVGSVGElement>(null)
  const [view, setView] = useState<ViewTransform>({ tx: 0, ty: 0, k: 1 })
  const [panning, setPanning] = useState(false)
  const drag = useRef<{ x: number; y: number } | null>(null)

  // Resolve any edge endpoint (a node id, or the self/goal id) to a point.
  const positionById = new Map<string, { x: number; y: number }>(
    snapshot.nodes.map((n) => [n.id, n.position]),
  )
  if (snapshot.goal) positionById.set(snapshot.goal.userId, center)

  // Zoom toward a fixed viewBox point, keeping it under the cursor / centre.
  const zoomToward = (point: { x: number; y: number }, factor: number) => {
    setView((prev) => {
      const k = clamp(prev.k * factor, MIN_ZOOM, MAX_ZOOM)
      const ratio = k / prev.k
      return {
        k,
        tx: point.x - ratio * (point.x - prev.tx),
        ty: point.y - ratio * (point.y - prev.ty),
      }
    })
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return
    const point = {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    }
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    zoomToward(point, factor)
  }

  // Attach the wheel listener natively with `{ passive: false }`. React's
  // synthetic onWheel is passive, so `preventDefault()` there is ignored and the
  // page scrolls/zooms instead of the web. A native non-passive listener keeps
  // the gesture locked to the canvas.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
    // handleWheel only reads stable props (width/height) + functional setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height])

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    // Don't start a pan when the press lands on a node — let it click/select.
    const target = e.target as Element
    if (target.closest?.('[data-testid^="web-node-"]')) return
    drag.current = { x: e.clientX, y: e.clientY }
    setPanning(true)
    svgRef.current?.setPointerCapture?.(e.pointerId)
  }

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return
    const dx = ((e.clientX - drag.current.x) / rect.width) * width
    const dy = ((e.clientY - drag.current.y) / rect.height) * height
    drag.current = { x: e.clientX, y: e.clientY }
    setView((prev) => ({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }))
  }

  const endPan = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return
    drag.current = null
    setPanning(false)
    svgRef.current?.releasePointerCapture?.(e.pointerId)
  }

  const resetView = () => setView({ tx: 0, ty: 0, k: 1 })

  return (
    <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
      <svg
        ref={svgRef}
        data-testid="web-canvas"
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role={onNodeSelect ? 'group' : 'img'}
        aria-label="Connection web"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerLeave={endPan}
        style={{
          display: 'block',
          touchAction: 'none',
          overflow: 'hidden',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          cursor: panning ? 'grabbing' : snapshot.goal ? 'grab' : 'default',
        }}
      >
        {/* Transparent capture surface so panning works over empty space. */}
        <rect x={0} y={0} width={width} height={height} fill="transparent" />

        <g
          data-testid="web-viewport"
          transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}
        >
          <g data-testid="web-edges">
            {snapshot.edges.map((edge) => {
              const a = positionById.get(edge.source)
              const b = positionById.get(edge.target)
              if (!a || !b) return null
              return (
                <motion.line
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
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                />
              )
            })}
          </g>

          {snapshot.goal && (
            <motion.g
              data-testid="web-self"
              initial={{ opacity: 0, x: center.x, y: center.y, scale: 0.7 }}
              animate={{ opacity: 1, x: center.x, y: center.y, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            >
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
            </motion.g>
          )}

          <g data-testid="web-nodes">
            <AnimatePresence>
              {snapshot.nodes.map((node) => (
                <WebNodeMarker
                  key={node.id}
                  node={node}
                  selected={selectedId === node.id}
                  onSelect={onNodeSelect}
                  decoration={nodeDecorations?.[node.id]}
                />
              ))}
            </AnimatePresence>
          </g>
        </g>
      </svg>

      {snapshot.goal && (
        <div
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            display: 'flex',
            gap: 6,
          }}
        >
          <ZoomButton label="Zoom in" onClick={() => zoomToward(center, ZOOM_STEP)}>
            +
          </ZoomButton>
          <ZoomButton label="Zoom out" onClick={() => zoomToward(center, 1 / ZOOM_STEP)}>
            −
          </ZoomButton>
          <ZoomButton label="Reset view" onClick={resetView}>
            ⤢
          </ZoomButton>
        </div>
      )}
    </div>
  )
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        border: '1px solid #d9e1ec',
        background: '#ffffff',
        color: '#0a66c2',
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 1,
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
      }}
    >
      {children}
    </button>
  )
}
