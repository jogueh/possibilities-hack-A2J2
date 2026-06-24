'use client'

import { useEffect, useMemo, useReducer } from 'react'
import {
  Button,
  Card,
  Empty,
  Input,
  Progress,
  Select,
  Space,
  Typography,
} from 'antd'
import { AimOutlined, ReloadOutlined } from '@ant-design/icons'
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

const CANVAS_WIDTH = 820
const CANVAS_HEIGHT = 620

// Static goal suggestions — clicking one pre-fills the goal box (no API call).
const SUGGESTIONS = [
  'Grow my software engineering network in San Francisco.',
  'Find short, actionable connection and outreach tips.',
  'Meet people who can introduce me to my target community.',
]

// Presentational filter options. Real filtering is owned by sibling workflows
// (W2 data / W4 jobs); these render the control surface from the design.
const LOCATION_OPTIONS = ['San Francisco', 'New York', 'Remote']
const INDUSTRY_OPTIONS = ['Software', 'Product', 'Design', 'Recruiting']
const EVENT_OPTIONS = ['All events', 'Recently active', 'New connections']

const round = (n: number) => Math.round(n)
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

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

  const { snapshot, selectedId, goalText } = state
  const selected = snapshot.nodes.find((n) => n.id === selectedId) ?? null
  const isEmpty = snapshot.state === 'empty'

  // Bridge the reducer-driven board to the store NodeSidebar reads: when a goal
  // is mapped, seed the goal and fetch the viewer's own profile (used for the
  // "what you have in common" + AI talking-point sections). Cleared on reset.
  const goal = snapshot.goal
  useEffect(() => {
    if (!goal) {
      __setMockWebState({ goal: null, viewerProfile: null })
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

  // Presentational "metrics" derived from the seeded web. Real scoring is
  // owned by Workflow 2; these are deterministic placeholders for the demo.
  const degree1 = snapshot.nodes.filter((n) => n.degree === 1)
  const goalProgress = isEmpty ? 0 : round(avg(degree1.map((n) => n.relevanceScore)) * 100)
  const achievability = isEmpty ? 0 : round(avg(degree1.map((n) => n.interactionScore)) * 100)

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* ── Left column: goal, suggestions, metrics ─────────────────────── */}
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
              dispatch({ type: 'submitGoal' })
            }}
          />
          <Space style={{ marginTop: 12, width: '100%', justifyContent: 'space-between' }}>
            <Button
              type="primary"
              icon={<AimOutlined />}
              onClick={() => dispatch({ type: 'submitGoal' })}
            >
              Map my web
            </Button>
            {!isEmpty && (
              <Button
                type="text"
                icon={<ReloadOutlined />}
                onClick={() => dispatch({ type: 'reset' })}
              >
                Reset
              </Button>
            )}
          </Space>
        </Card>

        <Card title="Suggestions" size="small">
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
        </Card>

        <Card title="Metrics" size="small">
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Progress type="circle" percent={goalProgress} size={72} strokeColor="#0a66c2" />
              <Typography.Text strong>Goal Progress</Typography.Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography.Text type="secondary">Connection Achievability</Typography.Text>
              <Typography.Text strong>{achievability}%</Typography.Text>
            </div>
          </Space>
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
              Interactively rerank your relationships. Expand your web, reinforce its roots.
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
              onClose={() => dispatch({ type: 'clearSelection' })}
            />
          </div>

          {/* Dynamic filters (presentational; filtering owned by W2/W4). */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Typography.Text strong>Dynamic filters</Typography.Text>
            <Select
              size="small"
              aria-label="Filter by location"
              placeholder="Location"
              style={{ width: 150 }}
              options={LOCATION_OPTIONS.map((v) => ({ value: v, label: v }))}
              allowClear
            />
            <Select
              size="small"
              aria-label="Filter by industry"
              placeholder="Industry"
              style={{ width: 150 }}
              options={INDUSTRY_OPTIONS.map((v) => ({ value: v, label: v }))}
              allowClear
            />
            <Select
              size="small"
              aria-label="Filter by event activity"
              defaultValue="All events"
              style={{ width: 150 }}
              options={EVENT_OPTIONS.map((v) => ({ value: v, label: v }))}
            />
          </div>
        </Space>
      </Card>
    </div>
  )
}
