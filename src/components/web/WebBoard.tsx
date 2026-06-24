'use client'

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Space,
  Typography,
} from 'antd'
import { AimOutlined, ReloadOutlined, UpOutlined, DownOutlined } from '@ant-design/icons'
import WebCanvas from './WebCanvas'
import {
  boardReducer,
  createInitialBoardState,
  type BoardConfig,
} from './boardState'
import { SELF_USER_ID, webPeople } from '@/data/web_people'
import { NodeSidebar } from '@/components/NodeSidebar'
import { __setMockWebState } from '@/store/useWebStore'
import { fetchUserWithJobs } from '@/lib/userApi'
import type { WebEdge, WebNode } from '@/types/web'
import type { ParsedGoal } from '@/types/goal'
import type { PersonInput } from '@/lib/web/snapshot'

const CANVAS_WIDTH = 820
const CANVAS_HEIGHT = 620

// Static goal suggestions — clicking one pre-fills the goal box (no API call).
const SUGGESTIONS = [
  'Grow my software engineering network in San Francisco.',
  'Find short, actionable connection and outreach tips.',
  'Meet people who can introduce me to my target community.',
]

/**
 * Converts the `/api/web/generate` response (WebNode[] + WebEdge[], with
 * scores on the 0..100 scale) into the layout's `PersonInput[]` shape
 * (scores on 0..1, optional `via` for 2nd-degree). `via` is derived from
 * the dotted bridge edges the server emits between 1st- and 2nd-degree
 * nodes.
 */
function apiResponseToPeople(
  nodes: WebNode[],
  edges: WebEdge[],
): PersonInput[] {
  const viaByTarget = new Map<string, string>()
  for (const e of edges) {
    if (e.isDotted) viaByTarget.set(e.target, e.source)
  }
  return nodes.map((n) => {
    const person: PersonInput = {
      id: n.id,
      userId: n.userId,
      name: n.label,
      degree: n.degree,
      relevanceScore: n.relevanceScore / 100,
      interactionScore: n.interactionScore,
    }
    if (n.degree > 1) {
      // For any non-1st-degree node the connector is the previous-ring node
      // that introduces them (degree N-1). Derived from the dotted bridge
      // edge the server emits for the cross-ring link.
      const via = viaByTarget.get(n.id)
      if (via) person.via = via
    }
    return person
  })
}

export default function WebBoard() {
  const config: BoardConfig = useMemo(
    () => ({
      userId: SELF_USER_ID,
      people: webPeople,
      options: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    }),
    [],
  )

  const [state, dispatch] = useReducer(
    (s: ReturnType<typeof createInitialBoardState>, a: Parameters<typeof boardReducer>[1]) =>
      boardReducer(s, a, config),
    undefined,
    createInitialBoardState,
  )

  const { snapshot, selectedId, goalText, status, error } = state
  const selected = snapshot.nodes.find((n) => n.id === selectedId) ?? null
  const isEmpty = snapshot.state === 'empty'
  const selectedConnected = selected ? state.connectedIds.includes(selected.id) : false
  const loading = status === 'loading'

  // Collapsible side cards (chevron toggles) — purely presentational.
  const [showSuggestions, setShowSuggestions] = useState(true)

  // Wired-to-real-data submit: POST the goal + viewer id to /api/web/generate,
  // convert the server-returned graph into the layout's `PersonInput[]` shape,
  // and dispatch the resolved people so `buildSnapshot` lays out a goal-driven
  // web instead of replaying the hardcoded `webPeople` fallback.
  const submit = useCallback(async () => {
    const raw = goalText.trim()
    if (!raw || loading) return
    dispatch({ type: 'mapStart' })
    try {
      const res = await fetch('/api/web/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: raw, userId: SELF_USER_ID }),
      })
      if (!res.ok) {
        throw new Error(`Map failed: ${res.status} ${res.statusText}`)
      }
      const data = (await res.json()) as {
        nodes: WebNode[]
        edges: WebEdge[]
        parsedGoal?: ParsedGoal | null
      }
      const people = apiResponseToPeople(data.nodes, data.edges)
      dispatch({ type: 'submitGoalWithPeople', people })
      // Cache the server-parsed goal so NodeSidebar's filterRelevantJobs +
      // shared-context flow uses the LLM-aware parse instead of the sync
      // keyword fallback. (Field added by PR #56.)
      __setMockWebState({ parsedGoal: data.parsedGoal ?? null })
    } catch (e) {
      dispatch({
        type: 'mapError',
        error: e instanceof Error ? e.message : 'Failed to map your web.',
      })
    }
  }, [goalText, loading])

  // Bridge the reducer-driven board to the store NodeSidebar reads: when a goal
  // is mapped, seed the goal and fetch the viewer's own profile (used for the
  // "what you have in common" + AI talking-point sections). Cleared on reset.
  const goal = snapshot.goal
  useEffect(() => {
    if (!goal) {
      __setMockWebState({ goal: null, parsedGoal: null, viewerProfile: null })
      return
    }
    __setMockWebState({ goal: { raw: goal.raw, userId: goal.userId } })
    let cancelled = false
    fetchUserWithJobs(goal.userId).then((viewer) => {
      if (!cancelled) __setMockWebState({ viewerProfile: viewer })
    })
    return () => {
      cancelled = true
    }
  }, [goal])

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* ── Left column: goal + suggestions ─────────────────────────────── */}
      <Space orientation="vertical" size="middle" style={{ width: 300, flexShrink: 0 }}>
        <Card>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 2 }}>
            Define Your Goal
          </Typography.Title>
          <Typography.Text type="secondary">
            Expand your web, reinforce its roots.
          </Typography.Text>
          <Input.TextArea
            aria-label="Goal"
            placeholder="e.g. Grow my software engineering network in San Francisco"
            value={goalText}
            autoSize={{ minRows: 2, maxRows: 4 }}
            style={{ marginTop: 12 }}
            onChange={(e) => dispatch({ type: 'setGoalText', value: e.target.value })}
            onPressEnter={(e) => {
              // Shift+Enter inserts a newline; plain Enter submits the goal.
              if (e.shiftKey) return
              e.preventDefault()
              void submit()
            }}
          />
          <Space style={{ marginTop: 12, width: '100%', justifyContent: 'space-between' }}>
            <Button
              type="primary"
              icon={<AimOutlined />}
              loading={loading}
              disabled={!goalText.trim()}
              onClick={() => void submit()}
            >
              {loading ? 'Mapping…' : 'Map my web'}
            </Button>
            {!isEmpty && !loading && (
              <Button
                type="text"
                icon={<ReloadOutlined />}
                onClick={() => dispatch({ type: 'reset' })}
              >
                Reset
              </Button>
            )}
          </Space>
          {error && (
            <Alert
              type="error"
              showIcon
              message={error}
              style={{ marginTop: 12 }}
            />
          )}
        </Card>

        <Card
          title="Suggestions"
          size="small"
          extra={
            <Button
              type="text"
              size="small"
              aria-label={showSuggestions ? 'Collapse suggestions' : 'Expand suggestions'}
              aria-expanded={showSuggestions}
              icon={showSuggestions ? <UpOutlined /> : <DownOutlined />}
              onClick={() => setShowSuggestions((v) => !v)}
            />
          }
        >
          {showSuggestions && (
            <Space orientation="vertical" size={8} style={{ width: '100%' }}>
              {SUGGESTIONS.map((text) => (
                <Button
                  key={text}
                  type="link"
                  onClick={() => dispatch({ type: 'setGoalText', value: text })}
                  style={{
                    display: 'block',
                    height: 'auto',
                    padding: 0,
                    textAlign: 'left',
                    whiteSpace: 'normal',
                    lineHeight: 1.4,
                  }}
                >
                  • {text}
                </Button>
              ))}
            </Space>
          )}
        </Card>
      </Space>

      {/* ── Center column: the network web ──────────────────────────────── */}
      <Card style={{ flex: 1, minWidth: 0 }}>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
              Your Network Web
            </Typography.Title>
            <Typography.Text type="secondary">
              Interactively re-rank your relationships.
              <br />
              Expand your web, reinforce its roots.
            </Typography.Text>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                background: '#f7f9fb',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              {isEmpty ? (
                <div style={{ padding: 48 }}>
                  <Empty description="No goal yet — tell us where you want to go and we'll map who can help." />
                </div>
              ) : (
                <WebCanvas
                  snapshot={snapshot}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  selectedId={selectedId}
                  onNodeSelect={(id) => dispatch({ type: 'selectNode', id })}
                />
              )}
            </div>

            <NodeSidebar
              node={selected}
              connected={selectedConnected}
              onConnect={(id) => dispatch({ type: 'connectNode', id })}
              onClose={() => dispatch({ type: 'clearSelection' })}
            />
          </div>
        </Space>
      </Card>
    </div>
  )
}
