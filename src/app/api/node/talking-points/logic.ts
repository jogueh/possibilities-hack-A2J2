// W3-OWNED. Core logic for the talking-point endpoint — separated for unit testing.
// See plan.md. ⚠️ Salary data must NEVER enter the prompt.
import type { SharedContext } from "@/types/sharedContext";

export interface TalkingPointRequest {
  goalRaw: string;
  viewerSummary: string;
  targetSummary: string;
  sharedContext: SharedContext[];
}

const MODEL = "openai/gpt-4o-mini";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 5000;

export function staticFallback(sharedContext: SharedContext[]): string {
  const skill = sharedContext.find((c) => c.type === "skill");
  const school = sharedContext.find((c) => c.type === "school");
  const anchor =
    skill?.label.replace(/^Shared skill:\s*/i, "") ??
    school?.label.replace(/^Both attended\s*/i, "") ??
    sharedContext[0]?.label ??
    "your shared background";
  return `Mention your shared background in ${anchor}.`;
}

export function buildPrompt(req: TalkingPointRequest): string {
  const shared = req.sharedContext.map((c) => c.label).join("; ") || "none";
  return [
    `Career goal: ${req.goalRaw}`,
    `About me (viewer): ${req.viewerSummary}`,
    `About them (target): ${req.targetSummary}`,
    `Shared context: ${shared}`,
    "",
    "Write ONE concrete, friendly outreach message opener (1–2 sentences) I could send",
    "to this person to advance my goal. Reference the shared context if useful.",
    "Return only the opener text, no preamble.",
  ].join("\n");
}

type FetchLike = typeof fetch;

/**
 * Generates a 1–2 sentence outreach opener via OpenRouter. Falls back to a static
 * suggestion on timeout, missing API key, or any error. Never includes salary data
 * (the caller passes summaries only).
 */
export async function generateTalkingPoint(
  req: TalkingPointRequest,
  deps: { fetchImpl?: FetchLike; apiKey?: string; timeoutMs?: number } = {},
): Promise<{ tip: string }> {
  const apiKey = deps.apiKey ?? process.env.OPENROUTER_API_KEY;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;

  if (!apiKey) return { tip: staticFallback(req.sharedContext) };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: buildPrompt(req) }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { tip: staticFallback(req.sharedContext) };
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const tip = data.choices?.[0]?.message?.content?.trim();
    return { tip: tip || staticFallback(req.sharedContext) };
  } catch {
    return { tip: staticFallback(req.sharedContext) };
  } finally {
    clearTimeout(timer);
  }
}
