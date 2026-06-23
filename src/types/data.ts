// Raw dataset shapes from pit.najera.cc. These mirror the JSON exactly — do not
// add UI concerns here. Consumed by Workflow 2's API layer and shared with W3/W4.

export interface SchoolHistoryEntry {
  school_name: string
  degree: string
  graduation_year: number
}

export interface User {
  id: string
  name: string
  school_history: SchoolHistoryEntry[]
  job_history: string[]
  current_location: string
  posts_activity: string[]
  skills: string[]
  courses: string[]
}

export interface Job {
  id: string
  company: string
  location: string
  position: string
  salary_range: { from: string; to: string }
  industry: string
  level: string
  easy_apply: boolean
  description: string
}

export interface CourseLength {
  value: number
  unit: string
}

export interface Course {
  id: string
  name: string
  category: string
  skills: string[]
  length: CourseLength
  level: string
}

/**
 * A User with `job_history` resolved from string ids to full Job records.
 * Returned by `resolveUserWithJobs` and the `GET /api/user/[userId]` endpoint.
 */
export interface UserWithJobs extends Omit<User, 'job_history'> {
  job_history: Job[]
}
