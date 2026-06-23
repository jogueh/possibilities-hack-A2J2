import type { PersonInput } from '@/lib/web/snapshot'

// Curated mock graph for Workflow 1's demo. Workflow 3 (scoring) will later
// supply real relevance/interaction scores; Workflow 2 supplies the goal.
// 1st-degree people are direct connections; 2nd-degree people reach the user
// via a named 1st-degree connector (`via`).

export const SELF_USER_ID = 'self_me'

export const webPeople: PersonInput[] = [
  // 1st-degree (direct connections)
  { id: 'p_amir', name: 'Amir Khan', degree: 1, interactionScore: 0.9, relevanceScore: 0.82 },
  { id: 'p_bianca', name: 'Bianca Rossi', degree: 1, interactionScore: 0.5, relevanceScore: 0.55 },
  { id: 'p_chen', name: 'Wei Chen', degree: 1, interactionScore: 0.7, relevanceScore: 0.68 },
  { id: 'p_dara', name: 'Dara Okafor', degree: 1, interactionScore: 0.3, relevanceScore: 0.28 },

  // 2nd-degree (warm-path frontier), each reachable via a 1st-degree connector
  { id: 'p_elena', name: 'Elena Petrova', degree: 2, via: 'p_amir', interactionScore: 0.6, relevanceScore: 0.74 },
  { id: 'p_femi', name: 'Femi Adeyemi', degree: 2, via: 'p_amir', interactionScore: 0.4, relevanceScore: 0.41 },
  { id: 'p_grace', name: 'Grace Lin', degree: 2, via: 'p_chen', interactionScore: 0.5, relevanceScore: 0.63 },
  { id: 'p_hugo', name: 'Hugo Martins', degree: 2, via: 'p_chen', interactionScore: 0.2, relevanceScore: 0.2 },
  { id: 'p_ines', name: 'Ines Duarte', degree: 2, via: 'p_bianca', interactionScore: 0.45, relevanceScore: 0.52 },
]
