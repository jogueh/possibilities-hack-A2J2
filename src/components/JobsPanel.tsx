"use client";
// W4-OWNED. Jobs Panel: goal-matched job postings cross-referenced against the web.
// Left-anchored collapsible panel (opposite the W3 sidebar on the right). Reads `goal`
// and `nodes` from the web store; ranks jobs via the W4 scoring/matching engine.
//
// Data source is the W4 MOCK `@/mocks/jobsApi` (mirrors W2's future
// `GET /api/jobs/matches`). Swap that import for the real route at integration.
// Salary is NEVER rendered (scope rule). See plan.md
import { useEffect, useState } from "react";
import type { JobMatch } from "@/types/job";
import type { AlignmentTier } from "@/types/web";
import { useWebStore } from "@/store/useWebStore";
import { parseGoalFallback } from "@/lib/goalParser";
import { fetchJobMatches } from "@/mocks/jobsApi";
import { deriveAlignmentTier } from "@/lib/scoring";
import { LI } from "@/lib/linkedinTokens";

export const JOBS_PANEL_WIDTH = 360;

const TIER_LABEL: Record<AlignmentTier, string> = {
  strong: "Strong match",
  moderate: "Moderate match",
  weak: "Weak match",
};
const TIER_COLOR: Record<AlignmentTier, string> = {
  strong: LI.blue,
  moderate: "#B45309", // amber-700, readable on a light pill
  weak: LI.textSecondary,
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function overlapLabel(n: number): string {
  return n === 1 ? "1 person in your web worked here" : `${n} people in your web worked here`;
}

interface JobsPanelProps {
  open: boolean;
  onClose: () => void;
  /** Opens the given connection's W3 sidebar. Wired by the host (W1/W3) at integration. */
  onOpenConnection?: (userId: string) => void;
}

export function JobsPanel({ open, onClose, onOpenConnection }: JobsPanelProps) {
  const goal = useWebStore((s) => s.goal);
  const nodes = useWebStore((s) => s.nodes);

  const webUserIds = nodes.map((n) => n.userId);
  const requestKey = goal ? `${goal.raw}::${[...webUserIds].sort().join(",")}` : null;

  // Keyed result written only from the async callback (React 19: never setState
  // synchronously in an effect). `current === null` (for the active key) means a
  // request is in flight; `status` distinguishes a real error from zero results.
  const [result, setResult] = useState<
    { key: string; status: "loaded" | "error"; matches: JobMatch[] } | null
  >(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !goal || !requestKey) return;
    let cancelled = false;
    fetchJobMatches(parseGoalFallback(goal.raw), webUserIds)
      .then((matches) => {
        if (!cancelled) setResult({ key: requestKey, status: "loaded", matches });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, status: "error", matches: [] });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requestKey, reloadToken]);

  if (!open) return null;

  // Only trust the stored result if it matches the current request key.
  const current = result?.key === requestKey ? result : null;

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const retry = () => {
    setResult(null);
    setReloadToken((t) => t + 1);
  };

  return (
    <aside
      data-testid="jobs-panel"
      aria-label="Jobs for your goal"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        height: "100vh",
        width: JOBS_PANEL_WIDTH,
        background: LI.surface,
        boxShadow: "2px 0 12px rgba(0,0,0,0.12)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        zIndex: 1000,
      }}
    >
      <header
        style={{
          background: LI.bg,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${LI.border}`,
          position: "sticky",
          top: 0,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Jobs for your goal</div>
          {goal && (
            <div style={{ fontSize: 12, color: LI.textSecondary, marginTop: 2 }}>
              {goal.raw}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close jobs panel"
          style={{
            border: "none",
            background: "transparent",
            fontSize: 20,
            lineHeight: 1,
            cursor: "pointer",
            color: LI.textSecondary,
          }}
        >
          ×
        </button>
      </header>

      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        {!goal && (
          <p style={{ color: LI.textSecondary, fontSize: 14, margin: 0 }}>
            Set a career goal to see matching roles.
          </p>
        )}

        {goal && current === null && (
          <p style={{ color: LI.textSecondary, fontSize: 14, margin: 0 }}>Finding roles…</p>
        )}

        {goal && current?.status === "error" && (
          <div
            data-testid="jobs-error-state"
            style={{
              textAlign: "center",
              color: LI.textSecondary,
              fontSize: 14,
              padding: "24px 8px",
            }}
          >
            <div style={{ fontWeight: 600, color: LI.text, marginBottom: 6 }}>
              Couldn’t load jobs
            </div>
            Something went wrong fetching matches for your goal.
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={retry}
                style={{
                  border: `1px solid ${LI.blue}`,
                  background: LI.surface,
                  color: LI.blue,
                  borderRadius: 16,
                  padding: "6px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {goal && current?.status === "loaded" && current.matches.length === 0 && (
          <div
            data-testid="jobs-empty-state"
            style={{
              textAlign: "center",
              color: LI.textSecondary,
              fontSize: 14,
              padding: "32px 8px",
            }}
          >
            <div style={{ fontWeight: 600, color: LI.text, marginBottom: 6 }}>
              No strong matches yet
            </div>
            Try exploring other nodes of your web — adding more connections can surface
            new roles you’re a fit for.
          </div>
        )}

        {goal &&
          current?.status === "loaded" &&
          current.matches.map((match) => (
            <JobCard
              key={match.job.id}
              match={match}
              expanded={expanded.has(match.job.id)}
              onToggle={() => toggleExpand(match.job.id)}
              onOpenConnection={onOpenConnection}
            />
          ))}
      </div>
    </aside>
  );
}

interface JobCardProps {
  match: JobMatch;
  expanded: boolean;
  onToggle: () => void;
  onOpenConnection?: (userId: string) => void;
}

function JobCard({ match, expanded, onToggle, onOpenConnection }: JobCardProps) {
  const { job, relevanceScore, webConnections } = match;
  const tier = deriveAlignmentTier(relevanceScore);

  return (
    <article
      data-testid="job-card"
      style={{
        border: `1px solid ${LI.border}`,
        borderRadius: 10,
        background: LI.surface,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div
            aria-hidden="true"
            style={{
              width: 40,
              height: 40,
              borderRadius: 6,
              background: LI.bg,
              color: LI.blue,
              fontWeight: 700,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {initials(job.company)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{job.position}</div>
            <div style={{ fontSize: 13, color: LI.text }}>{job.company}</div>
            <div style={{ fontSize: 12, color: LI.textSecondary }}>
              {job.location} · {job.level}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: TIER_COLOR[tier],
              border: `1px solid ${TIER_COLOR[tier]}`,
              borderRadius: 12,
              padding: "2px 8px",
            }}
          >
            {TIER_LABEL[tier]}
          </span>
          {job.easy_apply && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: LI.surface,
                background: LI.green,
                borderRadius: 12,
                padding: "2px 8px",
              }}
            >
              Easy Apply
            </span>
          )}
        </div>

        {webConnections.length > 0 && (
          <div
            data-testid="web-overlap-callout"
            style={{
              marginTop: 10,
              background: "#EAF1FB",
              border: `1px solid ${LI.blue}`,
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: LI.blueHover }}>
              {overlapLabel(webConnections.length)}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {webConnections.map((c) => (
                <button
                  key={c.userId}
                  type="button"
                  disabled={!onOpenConnection}
                  onClick={() => onOpenConnection?.(c.userId)}
                  title={`${c.name} — ${c.role}`}
                  aria-label={`Open ${c.name}'s profile`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    border: `1px solid ${LI.blue}`,
                    background: LI.surface,
                    borderRadius: 14,
                    padding: "2px 8px 2px 2px",
                    cursor: onOpenConnection ? "pointer" : "not-allowed",
                    opacity: onOpenConnection ? 1 : 0.7,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: LI.blue,
                      color: LI.surface,
                      fontSize: 10,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {initials(c.name)}
                  </span>
                  <span style={{ fontSize: 12, color: LI.text }}>{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: "100%",
          border: "none",
          borderTop: `1px solid ${LI.border}`,
          background: LI.bg,
          padding: "8px 12px",
          fontSize: 13,
          fontWeight: 600,
          color: LI.blue,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {expanded ? "Hide role ▲" : "View role ▼"}
      </button>
      {expanded && (
        <p style={{ margin: 0, padding: 12, fontSize: 13, color: LI.text }}>{job.description}</p>
      )}
    </article>
  );
}
