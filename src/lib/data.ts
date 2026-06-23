import type { Course, Job, User, UserWithJobs } from '@/types/data'

// Server-side fetch + resolution layer for the three static datasets.
// The datasets are immutable hackathon data, so each is fetched once with
// `cache: 'force-cache'` (no revalidation) and additionally memoized in a
// module-level cache to avoid re-parsing the JSON on every request.

const USERS_URL = 'https://pit.najera.cc/user_data.json'
const JOBS_URL = 'https://pit.najera.cc/jobs_data.json'
const COURSES_URL = 'https://pit.najera.cc/course_data.json'

let usersCache: User[] | null = null
let jobsCache: Job[] | null = null
let coursesCache: Course[] | null = null
let jobsByIdCache: Map<string, Job> | null = null
let usersByIdCache: Map<string, User> | null = null

let usersPromise: Promise<User[]> | null = null
let jobsPromise: Promise<Job[]> | null = null
let coursesPromise: Promise<Course[]> | null = null

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'force-cache' })
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

export async function fetchUsers(): Promise<User[]> {
  if (usersCache) return usersCache
  if (!usersPromise) {
    usersPromise = fetchJson<User[]>(USERS_URL).then((data) => {
      usersCache = data
      usersByIdCache = new Map(data.map((u) => [u.id, u]))
      return data
    })
  }
  return usersPromise
}

export async function fetchJobs(): Promise<Job[]> {
  if (jobsCache) return jobsCache
  if (!jobsPromise) {
    jobsPromise = fetchJson<Job[]>(JOBS_URL).then((data) => {
      jobsCache = data
      jobsByIdCache = new Map(data.map((j) => [j.id, j]))
      return data
    })
  }
  return jobsPromise
}

export async function fetchCourses(): Promise<Course[]> {
  if (coursesCache) return coursesCache
  if (!coursesPromise) {
    coursesPromise = fetchJson<Course[]>(COURSES_URL).then((data) => {
      coursesCache = data
      return data
    })
  }
  return coursesPromise
}

export async function getAllUsers(): Promise<User[]> {
  return fetchUsers()
}

export async function resolveUser(userId: string): Promise<User | null> {
  await fetchUsers()
  return usersByIdCache?.get(userId) ?? null
}

export async function resolveJobs(jobIds: string[]): Promise<Job[]> {
  await fetchJobs()
  if (!jobsByIdCache) return []
  const out: Job[] = []
  for (const id of jobIds) {
    const j = jobsByIdCache.get(id)
    if (j) out.push(j)
  }
  return out
}

export async function resolveUserWithJobs(
  userId: string,
): Promise<UserWithJobs | null> {
  const user = await resolveUser(userId)
  if (!user) return null
  const jobs = await resolveJobs(user.job_history)
  return {
    id: user.id,
    name: user.name,
    school_history: user.school_history,
    current_location: user.current_location,
    posts_activity: user.posts_activity,
    skills: user.skills,
    courses: user.courses,
    job_history: jobs,
  }
}

/**
 * Test-only: clears the module-level caches so each test starts from a clean
 * slate. Not exported via the public surface of this module conceptually, but
 * exported here because Vitest doesn't have access to module internals.
 */
export function __resetDataCachesForTests(): void {
  usersCache = null
  jobsCache = null
  coursesCache = null
  jobsByIdCache = null
  usersByIdCache = null
  usersPromise = null
  jobsPromise = null
  coursesPromise = null
}
