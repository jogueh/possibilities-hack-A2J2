// ⚠️ W3 MOCK — replace with W2 real `parseGoal` from `src/lib/goalParser.ts`. See plan.md
// W2 parses the goal via OpenRouter into a ParsedGoal. The sidebar needs a ParsedGoal to
// filter relevant experience; until W2 lands, derive one with naive keyword extraction.
import type { ParsedGoal } from "@/types/goal";

const ROLE_HINTS = [
  "engineer", "developer", "designer", "manager", "analyst", "scientist",
  "marketing", "sales", "product", "recruiter", "nurse", "consultant",
];
const INDUSTRY_HINTS = [
  "tech", "technology", "fintech", "healthcare", "finance", "education",
  "retail", "gaming", "biotech", "media",
];

export function parseGoalRaw(raw: string): ParsedGoal {
  const lower = raw.toLowerCase();
  const targetRole = ROLE_HINTS.find((h) => lower.includes(h));
  const targetIndustry = INDUSTRY_HINTS.find((h) => lower.includes(h));
  return {
    targetRole,
    targetIndustry,
    intent: raw,
  };
}
