import type { PersonInput } from '@/lib/web/snapshot'
import type { Job, User } from '@/types/data'
import userData from '@/data/user_data.json'
import jobsData from '@/data/jobs_data.json'

// Curated mock graph for Workflow 1's demo, themed to match the Network Web
// mockup. Workflow 3 (scoring) will later supply real relevance/interaction
// scores; Workflow 2 supplies the goal and resolved headlines.
// 1st-degree people are direct connections; 2nd-degree people reach the user
// via a named 1st-degree connector (`via`).
//
// `userId` on each person is a real member id in `src/data/user_data.json`. The
// node's displayed `name`/`headline` are derived from that dataset (and the
// member's first resolvable job in `src/data/jobs_data.json`) so the canvas node
// always matches the profile the NodeSidebar fetches by the same `userId`. Only
// the curated graph shape — `id`, `degree`, `via`, and the demo scores — is
// authored here.
export const SELF_USER_ID = 'user_1047'

const usersById = new Map((userData as User[]).map((u) => [u.id, u]))
const jobsById = new Map((jobsData as Job[]).map((j) => [j.id, j]))

// Resolve the display name + headline for a member straight from the local
// datasets, mirroring how the sidebar header renders `user.name` and the first
// resolvable `job_history` entry (`position at company`).
function profileFor(userId: string): { name: string; headline?: string } {
  const user = usersById.get(userId)
  if (!user) return { name: userId }
  const firstJob = user.job_history
    .map((id) => jobsById.get(id))
    .find((j): j is Job => Boolean(j))
  return {
    name: user.name,
    ...(firstJob ? { headline: `${firstJob.position} at ${firstJob.company}` } : {}),
  }
}

// A curated graph entry: everything except the displayed name/headline, which
// are derived from the datasets by `userId`.
type CuratedPerson = Omit<PersonInput, 'name' | 'headline'> &
  Required<Pick<PersonInput, 'userId'>>

function withProfile(person: CuratedPerson): PersonInput {
  return { ...person, ...profileFor(person.userId) }
}

const curatedPeople: CuratedPerson[] = [
  // 1st-degree (direct connections)
  { id: 'p_alice', userId: 'user_1151', degree: 1, interactionScore: 0.9, relevanceScore: 0.86 },
  { id: 'p_rene', userId: 'user_1249', degree: 1, interactionScore: 0.6, relevanceScore: 0.71 },
  { id: 'p_sarah', userId: 'user_1148', degree: 1, interactionScore: 0.7, relevanceScore: 0.55 },
  { id: 'p_john', userId: 'user_1227', degree: 1, interactionScore: 0.8, relevanceScore: 0.78 },
  { id: 'p_maria_d', userId: 'user_1286', degree: 1, interactionScore: 0.3, relevanceScore: 0.26 },
  { id: 'p_maria_r', userId: 'user_1405', degree: 1, interactionScore: 0.85, relevanceScore: 0.69 },

  // 2nd-degree (warm-path frontier), each reachable via a 1st-degree connector
  { id: 'p_david_l', userId: 'user_1364', degree: 2, via: 'p_john', interactionScore: 0.5, relevanceScore: 0.72 },
  { id: 'p_david_k', userId: 'user_1386', degree: 2, via: 'p_john', interactionScore: 0.4, relevanceScore: 0.58 },
  { id: 'p_grace', userId: 'user_1465', degree: 2, via: 'p_alice', interactionScore: 0.5, relevanceScore: 0.63 },
]

export const webPeople: PersonInput[] = curatedPeople.map(withProfile)

