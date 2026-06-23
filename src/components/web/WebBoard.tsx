'use client'

import { useMemo, useReducer } from 'react'
import { Button, Card, Empty, Input, Space, Tag, Typography } from 'antd'
import { AimOutlined, ReloadOutlined } from '@ant-design/icons'
import type { AlignmentTier } from '@/types/web'
import WebCanvas from './WebCanvas'
import {
  boardReducer,
  createInitialBoardState,
  type BoardConfig,
} from './boardState'
import { SELF_USER_ID, webPeople } from '@/data/web_people'

const CANVAS_WIDTH = 720
const CANVAS_HEIGHT = 520

const TIER_LABEL: Record<AlignmentTier, { text: string; color: string }> = {
  strong: { text: 'Strong fit', color: 'blue' },
  moderate: { text: 'Moderate fit', color: 'green' },
  weak: { text: 'Weak fit', color: 'default' },
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

  const { snapshot, selectedId, goalText } = state
  const selected = snapshot.nodes.find((n) => n.id === selectedId) ?? null
  const isEmpty = snapshot.state === 'empty'

  return (
    <Card>
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Typography.Title level={4} style={{ marginBottom: 4 }}>
            Career GPS — your connection web
          </Typography.Title>
          <Typography.Text type="secondary">
            Set a goal to map the warm paths from your network toward it.
          </Typography.Text>
        </div>

        <Space.Compact style={{ width: '100%', maxWidth: 560 }}>
          <Input
            aria-label="Goal"
            placeholder="e.g. Break into product management at a fintech"
            value={goalText}
            onChange={(e) => dispatch({ type: 'setGoalText', value: e.target.value })}
            onPressEnter={() => dispatch({ type: 'submitGoal' })}
            allowClear
          />
          <Button
            type="primary"
            icon={<AimOutlined />}
            onClick={() => dispatch({ type: 'submitGoal' })}
          >
            Map my web
          </Button>
          {!isEmpty && (
            <Button icon={<ReloadOutlined />} onClick={() => dispatch({ type: 'reset' })}>
              Reset
            </Button>
          )}
        </Space.Compact>

        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              background: '#f4f2ee',
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

          {selected && (
            <Card
              size="small"
              style={{ width: 260, flexShrink: 0 }}
              title={selected.label}
            >
              <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                <Tag color={TIER_LABEL[selected.alignmentTier].color}>
                  {TIER_LABEL[selected.alignmentTier].text}
                </Tag>
                <Typography.Text type="secondary">
                  {selected.degree === 1 ? '1st-degree connection' : '2nd-degree (warm path)'}
                </Typography.Text>
                <Typography.Text type="secondary">
                  Relevance {(selected.relevanceScore * 100).toFixed(0)}%
                </Typography.Text>
                {selected.degree === 1 ? (
                  <Typography.Text type="secondary">
                    Click to reveal who they can introduce you to.
                  </Typography.Text>
                ) : (
                  // Placeholder hook for Workflow 4 (AI double-opt-in intro).
                  <Button type="primary" block disabled>
                    Draft warm intro
                  </Button>
                )}
              </Space>
            </Card>
          )}
        </div>
      </Space>
    </Card>
  )
}
