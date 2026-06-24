import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/user/[userId]/route'
import { __resetDataCachesForTests, __setUsersForTests } from '@/lib/data'
import type { Job, User } from '@/types/data'

const users: User[] = [
  {
    id: 'user_alice',
    name: 'Alice Anderson',
    school_history: [
      { school_name: 'UC Berkeley', degree: 'CS', graduation_year: 2020 },
    ],
    job_history: ['job_1', 'job_unknown', 'job_2'],
    current_location: 'San Francisco, CA',
    posts_activity: ['post one'],
    skills: ['TypeScript'],
    courses: ['course_1'],
    connections: [],
  },
]

const jobs: Job[] = [
  {
    id: 'job_1',
    company: 'Acme',
    location: 'SF',
    position: 'SWE',
    salary_range: { from: '100', to: '200' },
    industry: 'Technology',
    level: 'Mid',
    easy_apply: true,
    description: 'desc 1',
  },
  {
    id: 'job_2',
    company: 'Beta',
    location: 'NYC',
    position: 'PM',
    salary_range: { from: '120', to: '180' },
    industry: 'Finance',
    level: 'Senior',
    easy_apply: false,
    description: 'desc 2',
  },
]

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

function getRequest(userId: string) {
  return {
    request: new Request(`http://localhost/api/user/${userId}`),
    context: { params: Promise.resolve({ userId }) },
  }
}

describe('GET /api/user/[userId]', () => {
  beforeEach(() => {
    __resetDataCachesForTests()
    __setUsersForTests(users)
    mockDatasetFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 200 with a fully-resolved UserWithJobs for a known id', async () => {
    const { request, context } = getRequest('user_alice')
    const res = await GET(request, context)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; name: string }
    expect(body.id).toBe('user_alice')
    expect(body.name).toBe('Alice Anderson')
  })

  it('resolves job_history from string[] to Job[]', async () => {
    const { request, context } = getRequest('user_alice')
    const res = await GET(request, context)
    const body = (await res.json()) as { job_history: Job[] }
    // Three ids requested but `job_unknown` is dropped silently — the response
    // contains only the resolvable jobs.
    expect(body.job_history).toHaveLength(2)
    expect(body.job_history[0].id).toBe('job_1')
    expect(body.job_history[0].company).toBe('Acme')
    expect(body.job_history[1].id).toBe('job_2')
  })

  it('preserves all other user fields verbatim', async () => {
    const { request, context } = getRequest('user_alice')
    const res = await GET(request, context)
    const body = (await res.json()) as {
      school_history: unknown[]
      current_location: string
      posts_activity: string[]
      skills: string[]
      courses: string[]
    }
    expect(body.school_history).toEqual([
      { school_name: 'UC Berkeley', degree: 'CS', graduation_year: 2020 },
    ])
    expect(body.current_location).toBe('San Francisco, CA')
    expect(body.posts_activity).toEqual(['post one'])
    expect(body.skills).toEqual(['TypeScript'])
    expect(body.courses).toEqual(['course_1'])
  })

  it('includes salary_range on each resolved job (contract boundary)', async () => {
    // The raw payload exposes salary_range because this is the canonical data
    // shape. Consumers (W3 sidebar, W4 timeline) are responsible for stripping
    // it before render or LLM prompts.
    const { request, context } = getRequest('user_alice')
    const res = await GET(request, context)
    const body = (await res.json()) as { job_history: Job[] }
    expect(body.job_history[0].salary_range).toEqual({ from: '100', to: '200' })
  })

  it('returns 404 with an error body for an unknown userId', async () => {
    const { request, context } = getRequest('user_does_not_exist')
    const res = await GET(request, context)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('User not found')
  })
})
