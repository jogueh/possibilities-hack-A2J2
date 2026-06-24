import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the LLM SDK so `parseGoal` always takes the keyword fallback path.
vi.mock('ai', () => ({ generateObject: vi.fn() }))
vi.mock('@openrouter/ai-sdk-provider', () => {
  const chat = vi.fn((model: string) => ({ __mockModel: model }))
  const openrouter = Object.assign(chat, { chat })
  return { openrouter }
})

import jobs from '@/data/jobs_data.json'
import { POST } from '@/app/api/jobs/matches/route'
import { __resetDataCachesForTests, __setUsersForTests } from '@/lib/data'
import type { Job, User } from '@/types/data'
import type { JobMatch } from '@/types/job'
import { generateObject } from 'ai'

const jobsFixture = jobs as Job[]
// Anchor user_0 to a job that matches the test goal ("software engineer roles in
// Boston"): an engineering role located in Boston. This keeps the job in the
// top relevance matches (role + location) so the web-overlap assertion below
// stays valid regardless of how company/position values are distributed.
const overlapJob =
  jobsFixture.find(
    (j) => j.location === 'Boston, MA' && /\bengineer\b/i.test(j.position),
  ) ?? jobsFixture[0]

const users: User[] = [
  {
    id: 'user_0',
    name: 'User Zero',
    school_history: [],
    job_history: [overlapJob.id],
    current_location: 'Boston, MA',
    posts_activity: [],
    skills: ['TypeScript'],
    courses: [],
    connections: ['user_1'],
  },
  {
    id: 'user_1',
    name: 'User One',
    school_history: [],
    job_history: [],
    current_location: 'Austin, TX',
    posts_activity: [],
    skills: ['Product'],
    courses: [],
    connections: ['user_0'],
  },
]

function mockDatasetFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url)
    let body: unknown
    if (u.includes('jobs_data.json')) body = jobsFixture
    else if (u.includes('course_data.json')) body = []
    else if (u.includes('user_data.json')) body = users
    else throw new Error(`Unexpected fetch URL: ${u}`)
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/jobs/matches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/jobs/matches', () => {
  const ORIGINAL_KEY = process.env.OPENROUTER_API_KEY

  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY // force the parseGoal keyword fallback
    __resetDataCachesForTests()
    __setUsersForTests(users)
    mockDatasetFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (ORIGINAL_KEY === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = ORIGINAL_KEY
  })

  it('returns a 200 with { matches } for a valid request', async () => {
    const res = await POST(
      postRequest({ goal: 'find software engineer roles in Boston', userIds: ['user_0'] }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { matches: JobMatch[] }
    expect(Array.isArray(body.matches)).toBe(true)
    expect(body.matches.length).toBeGreaterThan(0)
  })

  it('returns 400 with an issue list when goal is missing', async () => {
    const res = await POST(postRequest({ userIds: ['user_0'] }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; issues?: unknown[] }
    expect(body.error).toMatch(/Invalid request body/i)
    expect(body.issues).toBeDefined()
  })

  it('returns 400 when userIds is missing or not an array', async () => {
    for (const body of [{ goal: 'find software engineers' }, { goal: 'find software engineers', userIds: 'user_0' }]) {
      const res = await POST(postRequest(body))
      expect(res.status).toBe(400)
      const payload = (await res.json()) as { error: string; issues?: unknown[] }
      expect(payload.error).toMatch(/Invalid request body/i)
      expect(payload.issues).toBeDefined()
    }
  })

  it('returns 400 when the request body is not JSON', async () => {
    const req = new Request('http://localhost/api/jobs/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/Invalid JSON/i)
  })

  it("skips user ids that don't resolve", async () => {
    const validOnly = await POST(
      postRequest({ goal: 'find software engineer roles in Boston', userIds: ['user_0'] }),
    )
    const withMissing = await POST(
      postRequest({
        goal: 'find software engineer roles in Boston',
        userIds: ['missing_user', 'user_0'],
      }),
    )
    expect(withMissing.status).toBe(200)
    expect(await withMissing.json()).toEqual(await validOnly.json())
  })

  it('falls back gracefully when no OPENROUTER_API_KEY is set', async () => {
    const res = await POST(
      postRequest({ goal: 'looking for software engineer roles in Boston', userIds: ['user_0'] }),
    )
    expect(res.status).toBe(200)
    expect(generateObject).not.toHaveBeenCalled()
  })

  it('returns JobMatch records with relevanceScore and webConnections', async () => {
    const res = await POST(
      postRequest({ goal: 'find software engineer roles in Boston', userIds: ['user_0'] }),
    )
    const body = (await res.json()) as { matches: JobMatch[] }
    const match = body.matches.find((m) => m.webConnections.length > 0)
    expect(match).toBeDefined()
    expect(match).toMatchObject({
      relevanceScore: expect.any(Number),
      webConnections: expect.any(Array),
    })
    expect(match?.webConnections[0]).toMatchObject({
      userId: 'user_0',
      name: 'User Zero',
      role: expect.any(String),
    })
  })
})
