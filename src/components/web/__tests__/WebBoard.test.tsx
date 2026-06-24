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

beforeEach(() => {
  // NodeSidebar POSTs to the talking-points endpoint; stub it so the async tip
  // fetch resolves instead of throwing in jsdom.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ tip: 'Say hi!' }) })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})

describe('WebBoard', () => {
  it('shows the empty prompt before a goal is set', () => {
    const { container, getByText } = render(<WebBoard />)
    expect(getByText(/No goal yet/i)).toBeInTheDocument()
    expect(container.querySelector('[data-testid="web-canvas"]')).toBeNull()
  })

  it('maps the web when a goal is submitted', () => {
    const { container, getByLabelText, getByRole } = render(<WebBoard />)
    fireEvent.change(getByLabelText('Goal'), { target: { value: 'Become a PM' } })
    fireEvent.click(getByRole('button', { name: /map my web/i }))
    expect(container.querySelector('[data-testid="web-canvas"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-testid^="web-node-"]').length).toBeGreaterThan(0)
  })

  it('opens the real node sidebar and reveals 2nd-degree nodes when a node is clicked', async () => {
    const { container, getByLabelText, getByRole } = render(<WebBoard />)
    fireEvent.change(getByLabelText('Goal'), { target: { value: 'Become a PM' } })
    fireEvent.click(getByRole('button', { name: /map my web/i }))

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
