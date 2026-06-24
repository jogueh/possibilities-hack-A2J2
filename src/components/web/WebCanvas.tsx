'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { WebSnapshot } from '@/types/web'
import { edgeStrokeDasharray } from '@/lib/web/layout'
import { edgeStrengthStyleUnit, edgeStrengthOpacityUnit } from '@/lib/edgeStrength'
import WebNodeMarker from './WebNodeMarker'

export interface WebCanvasProps {
  snapshot: WebSnapshot
  width?: number
  height?: number
  selectedId?: string | null
  onNodeSelect?: (id: string) => void
  /**
   * When true the self ("You") centre node is rendered even with no goal mapped
   * yet. Used by the empty-state board so a blank web still shows the user at
   * the centre instead of an empty placeholder.
   */
  alwaysShowSelf?: boolean
}

const SELF_RADIUS = 30
const MIN_ZOOM = 0.6
const MAX_ZOOM = 3
const ZOOM_STEP = 1.2

// A normal connection line renders as flat LinkedIn blue. A line into a person
// the viewer has advanced up the relationship-depth ladder ("Connection Depth")
// is coloured by its strength TIER instead — blue (met) → indigo (collaborated)
// → violet→pink gradient (advocate) — so deeper relationships visibly strengthen.
const NORMAL_EDGE_COLOR = '#0A66C2'

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
  alwaysShowSelf = false,
}: WebCanvasProps) {
  const center = { x: width / 2, y: height / 2 }
  const svgRef = useRef<SVGSVGElement>(null)
  const [view, setView] = useState<ViewTransform>({ tx: 0, ty: 0, k: 1 })
  const [panning, setPanning] = useState(false)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const reduceMotion = useReducedMotion()

  // Defensive dedup: collapse `snapshot.nodes` to one entry per id before
  // render. Duplicate ids should never happen (every emitter — buildWeb,
  // expandNode, revealPerson — checks `inWeb` / `existingIds` before adding),
  // but if one ever slips through, React would log a duplicate-key warning
  // and AnimatePresence would produce ghost markers and stale text labels
  // when the snapshot rebuilds. Take the first occurrence; the others would
  // have shared its position anyway.
  const uniqueNodes = useMemo(() => {
    const seen = new Set<string>()
    return snapshot.nodes.filter((n) => {
      if (seen.has(n.id)) return false
      seen.add(n.id)
      return true
    })
  }, [snapshot.nodes])

  // Resolve any edge endpoint (a node id, or the self/goal id) to a point.
  const positionById = new Map<string, { x: number; y: number }>(
    uniqueNodes.map((n) => [n.id, n.position]),
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
          <defs>
            {snapshot.edges.map((edge) => {
              const g = edgeStrengthStyleUnit(edge.strength).gradient
              if (g === undefined || edge.isDotted || !edge.isMetUp) return null
              const a = positionById.get(edge.source)
              const b = positionById.get(edge.target)
              if (!a || !b) return null
              return (
                <linearGradient
                  key={`edge-grad-${edge.id}`}
                  id={`edge-grad-${edge.id}`}
                  gradientUnits="userSpaceOnUse"
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                >
                  <stop offset="0%" stopColor={g.from} />
                  <stop offset="100%" stopColor={g.to} />
                </linearGradient>
              )
            })}
          </defs>

          <g data-testid="web-edges">
            {snapshot.edges.map((edge) => {
              const a = positionById.get(edge.source)
              const b = positionById.get(edge.target)
              if (!a || !b) return null
              const style = edgeStrengthStyleUnit(edge.strength)
              const stroke = edge.isDotted
                ? '#b9c2cc'
                : edge.isMetUp
                  ? style.gradient
                    ? `url(#edge-grad-${edge.id})`
                    : style.color
                  : NORMAL_EDGE_COLOR
              const pulse = edge.isMetUp && style.pulse && !reduceMotion
              // Weaker connections render more transparent (stronger ties read
              // as more solid). `stroke-opacity` is independent of the entry
              // fade / met-up pulse, which drive element `opacity`.
              const strokeOpacity = edgeStrengthOpacityUnit(edge.strength)
              return (
                <motion.line
                  key={edge.id}
                  data-testid={`web-edge-${edge.id}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={stroke}
                  strokeOpacity={strokeOpacity}
                  strokeWidth={style.width}
                  strokeDasharray={edgeStrokeDasharray(edge.isDotted)}
                  strokeLinecap="round"
                  initial={{ opacity: 0 }}
                  animate={pulse ? { opacity: [0.55, 1, 0.55] } : { opacity: 1 }}
                  transition={
                    pulse
                      ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
                      : { duration: 0.3 }
                  }
                />
              )
            })}
          </g>

          {(snapshot.goal || alwaysShowSelf) && (
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
            <AnimatePresence mode="popLayout">
              {uniqueNodes.map((node) => (
                <WebNodeMarker
                  key={node.id}
                  node={node}
                  selected={selectedId === node.id}
                  onSelect={onNodeSelect}
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
