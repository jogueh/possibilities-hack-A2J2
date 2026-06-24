import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the LLM SDK so `parseGoal` always takes the keyword fallback path.
vi.mock('ai', () => ({ generateObject: vi.fn() }))
vi.mock('@openrouter/ai-sdk-provider', () => {
  const chat = vi.fn((model: string) => ({ __mockModel: model }))
  const openrouter = Object.assign(chat, { chat })
  return { openrouter }
})

import { POST } from '@/app/api/web/generate/route'
import { __resetDataCachesForTests } from '@/lib/data'
import {
  __resetMockConnectionGraph,
  __setMockConnectionGraph,
} from '@/mocks/connectionsMock'
import type { Job, User } from '@/types/data'

const users: User[] = Array.from({ length: 8 }, (_, i) => ({
  id: `user_${i}`,
  name: `User ${i}`,
  school_history: [],
  job_history: [`job_${i % 3}`],
  current_location: 'San Francisco, CA',
  posts_activity: [],
  skills: ['TypeScript'],
  courses: [],
}))

const jobs: Job[] = Array.from({ length: 3 }, (_, i) => ({
  id: `job_${i}`,
  company: `Company ${i}`,
  location: 'San Francisco, CA',
  position: 'Software Engineer',
  salary_range: { from: '100', to: '200' },
  industry: 'Technology',
  level: 'Mid',
  easy_apply: true,
  description: '',
}))

function mockDatasetFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url)
    let body: unknown
    if (u.includes('user_data.json')) body = users
    else if (u.includes('jobs_data.json')) body = jobs
    else if (u.includes('course_data.json')) body = []
    else throw new Error(`Unexpected fetch URL: ${u}`)
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/web/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/web/generate', () => {
  const ORIGINAL_KEY = process.env.OPENROUTER_API_KEY

  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY // force the parseGoal keyword fallback
    __resetDataCachesForTests()
    mockDatasetFetch()
    // Seed a fully-connected (modulo self) mock graph so the route returns a
    // non-empty web. W4 owns the real `src/lib/connections.ts`; this test
    // injects a graph through the mock module to keep the integration self-
    // contained.
    const allIds = [...users.map((u) => u.id), 'user_4579']
    const graph: Record<string, string[]> = {}
    for (const id of allIds) graph[id] = allIds.filter((other) => other !== id)
    __setMockConnectionGraph(graph)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    __resetMockConnectionGraph()
    if (ORIGINAL_KEY === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = ORIGINAL_KEY
  })

  it('returns a 200 with { nodes, edges } for a valid goal', async () => {
    const res = await POST(
      postRequest({ goal: 'find software engineers', userId: 'user_0' }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { nodes: unknown[]; edges: unknown[] }
    expect(Array.isArray(body.nodes)).toBe(true)
    expect(Array.isArray(body.edges)).toBe(true)
  })

  it('excludes the requesting userId from the returned nodes', async () => {
    const res = await POST(
      postRequest({ goal: 'find software engineers', userId: 'user_0' }),
    )
    const body = (await res.json()) as {
      nodes: Array<{ id: string; userId: string }>
    }
    expect(body.nodes.every((n) => n.userId !== 'user_0')).toBe(true)
  })

  it('defaults to user_4579 when userId is omitted', async () => {
    const usersWithViewer: User[] = [
      ...users,
      {
        id: 'user_4579',
        name: 'Bob Smith',
        school_history: [],
        job_history: [],
        current_location: 'Boston, MA',
        posts_activity: [],
        skills: [],
        courses: [],
      },
    ]
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = String(url)
      let body: unknown
      if (u.includes('user_data.json')) body = usersWithViewer
      else if (u.includes('jobs_data.json')) body = jobs
      else body = []
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    __resetDataCachesForTests()
    const res = await POST(postRequest({ goal: 'find software engineers' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { nodes: Array<{ userId: string }> }
    expect(body.nodes.every((n) => n.userId !== 'user_4579')).toBe(true)
  })

  it('returns 400 with an issue list when goal is missing', async () => {
    const res = await POST(postRequest({ userId: 'user_0' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; issues?: unknown[] }
    expect(body.error).toMatch(/Invalid request body/i)
    expect(body.issues).toBeDefined()
  })

  it('returns 400 when the request body is not JSON', async () => {
    const req = new Request('http://localhost/api/web/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/Invalid JSON/i)
  })

  it('falls back gracefully when the LLM is unavailable (no OPENROUTER_API_KEY)', async () => {
    // No key + non-OpenRouter test setup — should still return 200 because
    // `parseGoal` falls back to the keyword extractor.
    const res = await POST(
      postRequest({ goal: 'looking for software engineer roles in SF' }),
    )
    expect(res.status).toBe(200)
  })

  it('every emitted edge has strength=50 and a viewer-rooted or 2nd-degree-rooted source', async () => {
    const res = await POST(
      postRequest({ goal: 'find software engineers', userId: 'user_0' }),
    )
    const body = (await res.json()) as {
      nodes: Array<{ id: string; degree: 1 | 2 }>
      edges: Array<{ source: string; strength: number; isDotted: boolean }>
    }
    const firstDegreeIds = new Set(
      body.nodes.filter((n) => n.degree === 1).map((n) => n.id),
    )
    for (const e of body.edges) {
      expect(e.strength).toBe(50)
      if (!e.isDotted) {
        expect(e.source).toBe('user_0')
      } else {
        expect(firstDegreeIds.has(e.source)).toBe(true)
      }
    }
  })
})
