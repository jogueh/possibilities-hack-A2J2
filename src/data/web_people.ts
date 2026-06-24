import type { PersonInput } from '@/lib/web/snapshot'

// Curated mock graph for Workflow 1's demo, themed to match the Network Web
// mockup. Workflow 3 (scoring) will later supply real relevance/interaction
// scores; Workflow 2 supplies the goal and resolved headlines.
// 1st-degree people are direct connections; 2nd-degree people reach the user
// via a named 1st-degree connector (`via`).
//
// `userId` is a real member id in `src/data/user_data.json`; the node sidebar
// fetches the full profile by that id. Each `name`/`headline` here is the value
// resolved FROM that dataset (member name + first resolvable job in
// `src/data/jobs_data.json`, as `position at company`) so the canvas node always
// matches the profile the NodeSidebar shows. They are inlined (not imported from
// the JSON) on purpose: `web_people` is pulled into the client bundle via the
// `"use client"` WebBoard, and importing the raw datasets would ship ~2.5MB of
// JSON — including salary data that must never reach the client — to the browser.
// To regenerate after a dataset change, resolve `name`/`headline` by `userId`
// from user_data.json + jobs_data.json.
export const SELF_USER_ID = 'user_1047'

export const webPeople: PersonInput[] = [
  // 1st-degree (direct connections)
  // NOTE: `activityStatus` here is a placeholder for the demo so all three ring
  // colours (active=blue / moderate=amber / inactive=red) appear. Workflow 2 will
  // later replace these by deriving status from the real member's recent activity.
  { id: 'p_alice', userId: 'user_1151', name: 'Sofia Khan', headline: 'Customer Service Manager at Tech Innovators Inc.', degree: 1, interactionScore: 0.9, relevanceScore: 0.86, activityStatus: 'active' },
  { id: 'p_rene', userId: 'user_1249', name: 'Ingrid Costa', headline: 'Site Reliability Engineer at Cedar & Co.', degree: 1, interactionScore: 0.6, relevanceScore: 0.71, activityStatus: 'moderate' },
  { id: 'p_sarah', userId: 'user_1148', name: 'Hiro Nakamura', headline: 'Mobile Developer at Trailhead Software', degree: 1, interactionScore: 0.7, relevanceScore: 0.55, activityStatus: 'active' },
  { id: 'p_john', userId: 'user_1227', name: 'Priya Fischer', headline: 'Data Scientist at Aurora Networks', degree: 1, interactionScore: 0.8, relevanceScore: 0.78, activityStatus: 'moderate' },
  { id: 'p_maria_d', userId: 'user_1286', name: 'Mei Muller', headline: 'UX Designer at AI Dynamics', degree: 1, interactionScore: 0.3, relevanceScore: 0.26, activityStatus: 'inactive' },
  { id: 'p_maria_r', userId: 'user_1405', name: 'Tomas Kim', headline: 'Quantitative Analyst at Verdant Energy', degree: 1, interactionScore: 0.85, relevanceScore: 0.69, activityStatus: 'active' },

  // 2nd-degree (warm-path frontier), each reachable via a 1st-degree connector
  { id: 'p_david_l', userId: 'user_1364', name: 'Aaliyah Haddad', headline: 'Business Analyst at Verdant Energy', degree: 2, via: 'p_john', interactionScore: 0.5, relevanceScore: 0.72, activityStatus: 'moderate' },
  { id: 'p_david_k', userId: 'user_1386', name: 'Wei Olsen', headline: 'Marketing Manager at Harborview Partners', degree: 2, via: 'p_john', interactionScore: 0.4, relevanceScore: 0.58, activityStatus: 'inactive' },
  { id: 'p_grace', userId: 'user_1465', name: 'Nadia Nguyen', headline: 'Recruiter at Meridian Analytics', degree: 2, via: 'p_alice', interactionScore: 0.5, relevanceScore: 0.63, activityStatus: 'active' },
]
