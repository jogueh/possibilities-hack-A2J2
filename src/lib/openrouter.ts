import { openrouter } from '@openrouter/ai-sdk-provider'

// Shared OpenRouter client + helpers used by every W2 LLM call (goal parser,
// talking-points generator, ...). Centralizing the model id and key check keeps
// every LLM-touching endpoint behaving the same: silent skip when the key is
// unset, structured output via generateObject in the calling module.

// openrouter/free auto-routes across whatever free model is currently healthy
// and supports the requested capability (tool calling for structured output).
// This avoids hard-coding a single free model that may be rate-limited or
// deprecated upstream.
export const OPENROUTER_MODEL = 'openrouter/free'
// 10s gives the auto-router enough headroom when it picks a slower free model;
// the goal parser's keyword fallback handles longer outages gracefully.
export const LLM_TIMEOUT_MS = 10_000

/** Returns true when an LLM call should be attempted. */
export function hasOpenRouterKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY)
}

/**
 * Returns the AI-SDK chat model handle for the configured OpenRouter model.
 * Call sites pass this directly to `generateObject`/`generateText`.
 *
 * We use `.chat(...)` explicitly (instead of the `openrouter(...)` shorthand)
 * because `generateObject` needs the chat model — the chat model supports tool
 * calling, which is how the Vercel AI SDK implements structured JSON output
 * for llama-style instruction-tuned models.
 */
export function getOpenRouterModel(): ReturnType<typeof openrouter.chat> {
  return openrouter.chat(OPENROUTER_MODEL)
}
