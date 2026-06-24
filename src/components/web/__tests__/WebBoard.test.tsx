import { describe, it, expect, afterEach } from 'vitest'
import { render, fireEvent, cleanup, within } from '@testing-library/react'
import WebBoard from '@/components/web/WebBoard'

afterEach(cleanup)

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

  it('reveals a selection panel and 2nd-degree nodes when a node is clicked', () => {
    const { container, getByLabelText, getByRole } = render(<WebBoard />)
    fireEvent.change(getByLabelText('Goal'), { target: { value: 'Become a PM' } })
    fireEvent.click(getByRole('button', { name: /map my web/i }))

    const before = container.querySelectorAll('[data-testid^="web-node-"]').length
    fireEvent.click(container.querySelector('[data-testid="web-node-p_john"]')!)
    const after = container.querySelectorAll('[data-testid^="web-node-"]').length

    expect(after).toBeGreaterThan(before)
    // Selection panel renders the chosen person's hint copy.
    expect(
      within(container).getByText(/reveal who they can introduce you to/i),
    ).toBeInTheDocument()
  })
})
