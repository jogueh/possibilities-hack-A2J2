import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import WebBoard from '@/components/web/WebBoard'

// NodeSidebar (rendered for a selected node) resolves the target profile through
// the real data client. Mock it so the board test stays deterministic and never
// hits the network.
vi.mock('@/lib/userApi', () => ({
  fetchUserWithJobs: vi.fn(async () => ({
    id: 'user_1227',
    name: 'Network Contact',
    school_history: [],
    job_history: [],
    current_location: 'Boston, MA',
    posts_activity: [],
    skills: [],
    courses: [],
    connections: [],
  })),
}))

// Synthetic /api/web/generate response used to drive the board deterministically.
// Mirrors the real WebNode/WebEdge contract: relevanceScore is on the 0..100
// scale, dotted edges carry 2nd-degree bridges, and the node ids match what the
// canvas asserts on later in the suite.
const generateResponse = {
  nodes: [
    {
      id: 'p_john',
      userId: 'user_1227',
      label: 'Diana Prince',
      degree: 1,
      avatarInitials: 'DP',
      alignmentTier: 'strong',
      interactionScore: 0.8,
      relevanceScore: 78,
      position: { x: 0, y: 0 },
    },
    {
      id: 'p_alice',
      userId: 'user_1151',
      label: 'Charlie Brown',
      degree: 1,
      avatarInitials: 'CB',
      alignmentTier: 'strong',
      interactionScore: 0.9,
      relevanceScore: 86,
      position: { x: 0, y: 0 },
    },
    {
      id: 'p_david_l',
      userId: 'user_1364',
      label: 'Diana Prince',
      degree: 2,
      avatarInitials: 'DP',
      alignmentTier: 'strong',
      interactionScore: 0.5,
      relevanceScore: 72,
      position: { x: 0, y: 0 },
    },
  ],
  edges: [
    { id: 'self__p_john', source: SELF_USER_ID, target: 'p_john', strength: 50, isDotted: false },
    { id: 'self__p_alice', source: SELF_USER_ID, target: 'p_alice', strength: 50, isDotted: false },
    { id: 'p_john__p_david_l', source: 'p_john', target: 'p_david_l', strength: 50, isDotted: true },
  ],
}

import { SELF_USER_ID } from '@/data/web_people'

beforeEach(() => {
  // The board fetches /api/web/generate on submit and /api/node/talking-points
  // when the sidebar opens. Branch on the URL so a single stub serves both.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/web/generate')) {
        return new Response(JSON.stringify(generateResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ tip: 'Say hi!' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})

describe('WebBoard', () => {
  it('shows the user at the centre of an empty web before a goal is set', () => {
    const { container, getByText } = render(<WebBoard />)
    // The empty state now seeds a single self ("You") node at the centre via the
    // canvas (alwaysShowSelf) instead of a blank placeholder, so the web is
    // never empty even before a goal is mapped.
    expect(container.querySelector('[data-testid="web-canvas"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="web-self"]')).not.toBeNull()
    expect(getByText('You')).toBeInTheDocument()
  })

  it('maps the web from the /api/web/generate response when a goal is submitted', async () => {
    const { container, getByLabelText, getByRole } = render(<WebBoard />)
    fireEvent.change(getByLabelText('Goal'), { target: { value: 'Become a PM' } })
    fireEvent.click(getByRole('button', { name: /map my web/i }))
    // Canvas appears only after the API response is applied — asserts the
    // submit flow actually awaited the network round-trip.
    await waitFor(() =>
      expect(container.querySelector('[data-testid="web-canvas"]')).not.toBeNull(),
    )
    expect(container.querySelectorAll('[data-testid^="web-node-"]').length).toBeGreaterThan(0)
  })

  it('opens the real node sidebar and reveals 2nd-degree nodes when a node is clicked', async () => {
    const { container, getByLabelText, getByRole } = render(<WebBoard />)
    fireEvent.change(getByLabelText('Goal'), { target: { value: 'Become a PM' } })
    fireEvent.click(getByRole('button', { name: /map my web/i }))
    await waitFor(() =>
      expect(container.querySelector('[data-testid="web-node-p_john"]')).not.toBeNull(),
    )

    const before = container.querySelectorAll('[data-testid^="web-node-"]').length
    fireEvent.click(container.querySelector('[data-testid="web-node-p_john"]')!)
    const after = container.querySelectorAll('[data-testid^="web-node-"]').length

    expect(after).toBeGreaterThan(before)
    // The real NodeSidebar replaces the old placeholder panel and resolves the
    // selected member's profile from the data layer.
    const sidebar = await within(document.body).findByTestId('node-sidebar')
    expect(sidebar).toBeInTheDocument()
    await waitFor(() =>
      expect(within(sidebar).getByText('Network Contact')).toBeInTheDocument(),
    )
  })
})
