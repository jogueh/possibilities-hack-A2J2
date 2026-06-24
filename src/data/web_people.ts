import type { PersonInput } from '@/lib/web/snapshot'

// Curated mock graph for Workflow 1's demo, themed to match the Network Web
// mockup. Workflow 3 (scoring) will later supply real relevance/interaction
// scores; Workflow 2 supplies the goal and resolved headlines.
// 1st-degree people are direct connections; 2nd-degree people reach the user
// via a named 1st-degree connector (`via`).

export const SELF_USER_ID = 'self_me'

export const webPeople: PersonInput[] = [
  // 1st-degree (direct connections)
  // NOTE: `activityStatus` here is a placeholder for the demo so all three ring
  // colours (active=blue / moderate=amber / inactive=red) appear. Workflow 2 will
  // later replace these by deriving status from the real member's recent activity.
  { id: 'p_alice', name: 'Alice Johnson', headline: 'Software Engineer at Innovatech', degree: 1, interactionScore: 0.9, relevanceScore: 0.86, activityStatus: 'active' },
  { id: 'p_rene', name: 'René Ramos', headline: 'Software Engineer at Innovatech', degree: 1, interactionScore: 0.6, relevanceScore: 0.71, activityStatus: 'moderate' },
  { id: 'p_sarah', name: 'Sarah Chen', headline: 'Recent grad', degree: 1, interactionScore: 0.7, relevanceScore: 0.55, activityStatus: 'active' },
  { id: 'p_john', name: 'John Davis', headline: 'Senior Developer at Google', degree: 1, interactionScore: 0.8, relevanceScore: 0.78, activityStatus: 'moderate' },
  { id: 'p_maria_d', name: 'Maria Reyes', headline: 'Tech Developer', degree: 1, interactionScore: 0.3, relevanceScore: 0.26, activityStatus: 'inactive' },
  { id: 'p_maria_r', name: 'Maria Rivera', headline: 'Tech Recruiter', degree: 1, interactionScore: 0.85, relevanceScore: 0.69, activityStatus: 'active' },

  // 2nd-degree (warm-path frontier), each reachable via a 1st-degree connector
  { id: 'p_david_l', name: 'David Lee', headline: 'Senior Dev at Google', degree: 2, via: 'p_john', interactionScore: 0.5, relevanceScore: 0.72, activityStatus: 'moderate' },
  { id: 'p_david_k', name: 'David Kim', headline: 'Senior Dev at Google', degree: 2, via: 'p_john', interactionScore: 0.4, relevanceScore: 0.58, activityStatus: 'inactive' },
  { id: 'p_grace', name: 'Grace Lin', headline: 'Product Designer at Figma', degree: 2, via: 'p_alice', interactionScore: 0.5, relevanceScore: 0.63, activityStatus: 'active' },
]

