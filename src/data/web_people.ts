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
  { id: 'p_alice', userId: 'user_1151', name: 'Trulimero Trulicina', headline: 'Product Manager at Tech Innovators Inc.', degree: 1, interactionScore: 0.9, relevanceScore: 0.86 },
  { id: 'p_rene', userId: 'user_1249', name: 'Ingrid Costa', headline: 'Marketing Specialist at Global Solutions LLC', degree: 1, interactionScore: 0.6, relevanceScore: 0.71 },
  { id: 'p_sarah', userId: 'user_1148', name: 'Hiro Nakamura', headline: 'Sales Representative at Tech Innovators Inc.', degree: 1, interactionScore: 0.7, relevanceScore: 0.55 },
  { id: 'p_john', userId: 'user_1227', name: 'Priya Fischer', headline: 'Data Scientist at AI Dynamics', degree: 1, interactionScore: 0.8, relevanceScore: 0.78 },
  { id: 'p_maria_d', userId: 'user_1286', name: 'Jynxzi', headline: 'Marketing Specialist at AI Dynamics', degree: 1, interactionScore: 0.3, relevanceScore: 0.26 },
  { id: 'p_maria_r', userId: 'user_1405', name: 'Tomas Kim', headline: 'Customer Service Manager at FutureWorks', degree: 1, interactionScore: 0.85, relevanceScore: 0.69 },

  // 2nd-degree (warm-path frontier), each reachable via a 1st-degree connector
  { id: 'p_david_l', userId: 'user_1364', name: 'Jynxzi', headline: 'DevOps Engineer at AI Dynamics', degree: 2, via: 'p_john', interactionScore: 0.5, relevanceScore: 0.72 },
  { id: 'p_david_k', userId: 'user_1386', name: 'Wei Olsen', headline: 'Software Engineer at Tech Innovators Inc.', degree: 2, via: 'p_john', interactionScore: 0.4, relevanceScore: 0.58 },
  { id: 'p_grace', userId: 'user_1465', name: 'Nadia Nguyen', headline: 'HR Coordinator at Innovatech', degree: 2, via: 'p_alice', interactionScore: 0.5, relevanceScore: 0.63 },
]
