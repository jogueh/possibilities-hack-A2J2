import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetDataCachesForTests,
  __setUsersForTests,
  fetchCourses,
  fetchJobs,
  fetchUsers,
  resolveJobs,
  resolveUser,
  resolveUserWithJobs,
} from '@/lib/data'
import type { Course, Job, User } from '@/types/data'

const users: User[] = [
  {
    id: 'user_1',
    name: 'Alice Anderson',
    school_history: [
      { school_name: 'UC Berkeley', degree: 'CS', graduation_year: 2020 },
    ],
    job_history: ['job_1', 'job_2'],
    current_location: 'San Francisco, CA',
    posts_activity: ['post a', 'post b'],
    skills: ['TypeScript', 'React'],
    courses: ['course_1'],
    connections: ['user_2'],
  },
  {
    id: 'user_2',
    name: 'Bob Brown',
    school_history: [],
    job_history: ['job_unknown'],
    current_location: 'Austin, TX',
    posts_activity: [],
    skills: [],
    courses: [],
    connections: ['user_1'],
  },
]

const jobs: Job[] = [
  {
    id: 'job_1',
    company: 'Acme',
    location: 'SF',
    position: 'SWE',
    salary_range: { from: '100', to: '200' },
    industry: 'Tech',
    level: 'Mid',
    easy_apply: true,
    description: 'desc',
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
    description: 'desc',
  },
]

const courses: Course[] = [
  {
    id: 'course_1',
    name: 'Intro to Stuff',
    category: 'General',
    skills: ['Thinking'],
    length: { value: 1, unit: 'hours' },
    level: 'Easy',
  },
]

function mockFetch() {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url)
    let body: unknown
    if (u.includes('user_data.json')) body = users
    else if (u.includes('jobs_data.json')) body = jobs
    else if (u.includes('course_data.json')) body = courses
    else throw new Error(`Unexpected fetch URL: ${u}`)
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return fetchSpy
}

describe('lib/data — raw fetch + resolve helpers', () => {
  let fetchSpy: ReturnType<typeof mockFetch>

  beforeEach(() => {
    __resetDataCachesForTests()
    __setUsersForTests(users)
    fetchSpy = mockFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetchJobs/fetchCourses call fetch with cache: force-cache', async () => {
    await fetchJobs()
    await fetchCourses()

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    for (const call of fetchSpy.mock.calls) {
      const init = call[1] as RequestInit | undefined
      expect(init?.cache).toBe('force-cache')
    }
  })

  it('fetchUsers reads the local member table without hitting the network', async () => {
    __resetDataCachesForTests()
    const all = await fetchUsers()
    expect(all.length).toBeGreaterThan(0)
    expect(all[0]).toHaveProperty('connections')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('memoizes fetched datasets so fetch is only called once per dataset', async () => {
    await fetchJobs()
    await fetchJobs()
    await fetchJobs()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('resolveUser returns the user record for a known id', async () => {
    const u = await resolveUser('user_1')
    expect(u?.name).toBe('Alice Anderson')
  })

  it('resolveUser returns null for an unknown id', async () => {
    const u = await resolveUser('user_does_not_exist')
    expect(u).toBeNull()
  })

  it('resolveJobs returns records for the given ids and silently drops unknown ids', async () => {
    const resolved = await resolveJobs(['job_1', 'job_unknown', 'job_2'])
    expect(resolved.map((j) => j.id)).toEqual(['job_1', 'job_2'])
  })

  it('resolveUserWithJobs substitutes job_history (string[]) with Job[]', async () => {
    const u = await resolveUserWithJobs('user_1')
    expect(u).not.toBeNull()
    expect(u!.job_history).toHaveLength(2)
    expect(u!.job_history[0].id).toBe('job_1')
    expect(u!.job_history[0].company).toBe('Acme')
  })

  it('resolveUserWithJobs returns null for an unknown id', async () => {
    const u = await resolveUserWithJobs('nope')
    expect(u).toBeNull()
  })

  it('resolveUserWithJobs returns an empty job_history for a user with unresolved job ids', async () => {
    const u = await resolveUserWithJobs('user_2')
    expect(u).not.toBeNull()
    expect(u!.job_history).toEqual([])
  })

  it('throws a descriptive error when fetch returns non-OK', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('boom', { status: 500, statusText: 'Server Error' }),
    )
    __resetDataCachesForTests()
    await expect(fetchJobs()).rejects.toThrow(/Failed to fetch/)
  })
})
