import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('ai', () => ({ generateObject: vi.fn() }))
vi.mock('@openrouter/ai-sdk-provider', () => {
  const chat = vi.fn((model: string) => ({ __mockModel: model }))
  const openrouter = Object.assign(chat, { chat })
  return { openrouter }
})

import { generateObject } from 'ai'
import { POST } from '@/app/api/node/talking-points/route'

const generateObjectMock = vi.mocked(generateObject)

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/node/talking-points', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  goalRaw: 'find a Bay Area SWE role',
  viewerSummary: 'New grad. Skills: TypeScript.',
  targetSummary: 'Senior SWE at Stripe.',
  sharedContext: [
    { type: 'school', label: 'Both attended UC Berkeley' },
  ],
}

describe('POST /api/node/talking-points', () => {
  const ORIGINAL_KEY = process.env.OPENROUTER_API_KEY

  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY // force the deterministic fallback path
    generateObjectMock.mockReset()
  })

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = ORIGINAL_KEY
  })

  it('returns 200 with { tip } for a valid request', async () => {
    const res = await POST(postRequest(validBody))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { tip: string }
    expect(typeof body.tip).toBe('string')
    expect(body.tip.length).toBeGreaterThan(0)
  })

  it('returns 400 when goalRaw is missing', async () => {
    const { goalRaw: _drop, ...rest } = validBody
    void _drop
    const res = await POST(postRequest(rest))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; issues?: unknown[] }
    expect(body.error).toMatch(/Invalid request body/i)
    expect(body.issues).toBeDefined()
  })

  it('returns 400 when targetSummary is missing', async () => {
    const { targetSummary: _drop, ...rest } = validBody
    void _drop
    const res = await POST(postRequest(rest))
    expect(res.status).toBe(400)
  })

  it('returns 400 when sharedContext has an unknown type', async () => {
    const res = await POST(
      postRequest({
        ...validBody,
        sharedContext: [{ type: 'bogus', label: 'x' }],
      }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when the request body is not JSON', async () => {
    const req = new Request('http://localhost/api/node/talking-points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/Invalid JSON/i)
  })

  it('defaults sharedContext to [] when omitted', async () => {
    const { sharedContext: _drop, ...rest } = validBody
    void _drop
    const res = await POST(postRequest(rest))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { tip: string; tips: string[] }
    // With an empty sharedContext but a real targetSummary, the deterministic
    // fallback now produces a more specific role-anchored tip instead of the
    // generic "industry" line. Either is acceptable — the route just needs to
    // return SOMETHING non-empty.
    expect(typeof body.tip).toBe('string')
    expect(body.tip.length).toBeGreaterThan(0)
    expect(Array.isArray(body.tips)).toBe(true)
  })

  it('does not throw on LLM error — falls back to deterministic tip', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    generateObjectMock.mockRejectedValueOnce(new Error('rate limited'))
    const res = await POST(postRequest(validBody))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { tip: string }
    expect(body.tip).toMatch(/Berkeley/)
  })
})
