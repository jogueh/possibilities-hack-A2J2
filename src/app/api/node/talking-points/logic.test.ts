import { describe, it, expect, vi } from "vitest";
import {
  generateTalkingPoint,
  buildPrompt,
  staticFallback,
  type TalkingPointRequest,
} from "@/app/api/node/talking-points/logic";
import type { SharedContext } from "@/types/sharedContext";

const shared: SharedContext[] = [
  { type: "school", label: "Both attended UC Berkeley" },
  { type: "skill", label: "Shared skill: Python" },
];

const req: TalkingPointRequest = {
  goalRaw: "Break into SWE at a Bay Area startup",
  viewerSummary: "Python, recent grad analyst",
  targetSummary: "Senior SWE at Google",
  sharedContext: shared,
};

describe("talking-points logic", () => {
  it("returns the LLM tip when OpenRouter responds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Hey! Saw we both studied at Berkeley." } }] }),
    }) as unknown as typeof fetch;
    const { tip } = await generateTalkingPoint(req, { fetchImpl, apiKey: "k" });
    expect(tip).toBe("Hey! Saw we both studied at Berkeley.");
  });

  it("falls back to a static suggestion when no API key", async () => {
    const { tip } = await generateTalkingPoint(req, { apiKey: undefined });
    expect(tip).toBe("Mention your shared background in Python.");
  });

  it("falls back when the request times out", async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }) as unknown as typeof fetch;
    const { tip } = await generateTalkingPoint(req, { fetchImpl, apiKey: "k", timeoutMs: 10 });
    expect(tip).toBe("Mention your shared background in Python.");
  });

  it("falls back on non-ok response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
    const { tip } = await generateTalkingPoint(req, { fetchImpl, apiKey: "k" });
    expect(tip).toContain("Mention your shared background");
  });

  it("never includes salary data in the prompt", () => {
    const prompt = buildPrompt(req);
    expect(prompt.toLowerCase()).not.toContain("salary");
    expect(prompt).not.toMatch(/\$\d/);
  });

  it("staticFallback uses school when no skill is shared", () => {
    expect(staticFallback([{ type: "school", label: "Both attended MIT" }])).toBe(
      "Mention your shared background in MIT.",
    );
  });
});
