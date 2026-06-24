"use client";
// W3-OWNED. Node profile sidebar: shell + header + experience + commonalities + AI tip.
// 2nd-degree preview (Step 5) and Actions bar (Step 6) slot in below. See plan.md
import { useEffect, useRef, useState } from "react";
import type { WebNode } from "@/types/web";
import type { SharedContext } from "@/types/sharedContext";
import type { UserWithJobs } from "@/types/data";
import { useWebStore } from "@/mocks/useWebStore";
import { fetchUserWithJobs } from "@/lib/userApi";
import { ALIGNMENT_LABELS, alignmentColor } from "@/mocks/alignmentColors";
import { parseGoalRaw } from "@/mocks/goalParser";
import { filterRelevantJobs } from "@/lib/relevance";
import { getSharedContext } from "@/lib/sharedContext";
import { LI, SIDEBAR_WIDTH } from "@/lib/linkedinTokens";
import { CareerTimelineSlot } from "@/components/CareerTimelineSlot";
import { SecondDegreePreview } from "@/components/SecondDegreePreview";
import { ActionsBar } from "@/components/ActionsBar";

interface NodeSidebarProps {
  node: WebNode | null;
  onClose: () => void;
}

// Cache the AI tip per userId so re-opening the same node never re-calls the LLM.
const tipCache = new Map<string, string>();

// Test/dev helper (NOT part of the planned W1 API).
export function __resetNodeSidebarTipCache() {
  tipCache.clear();
}
function viewerSummary(viewer: Pick<UserWithJobs, "job_history" | "skills"> | null): string {
  if (!viewer) return "";
  const role = viewer.job_history[0];
  const skills = viewer.skills.slice(0, 3).filter(Boolean).join(", ");
  const parts = [skills, role ? `most recently ${role.position} at ${role.company}` : ""].filter(Boolean);
  return parts.join("; ");
}

function targetSummary(jobs: { position: string; company: string }[]): string {
  return jobs.map((j) => `${j.position} at ${j.company}`).join("; ");
}

export function NodeSidebar({ node, onClose }: NodeSidebarProps) {
  const goal = useWebStore((s) => s.goal);
  const viewerProfile = useWebStore((s) => s.viewerProfile);

  // State is keyed by userId and only ever written from async callbacks, so we never call
  // setState synchronously inside an effect (React 19 cascading-render rule).
  const [loaded, setLoaded] = useState<{ userId: string; user: UserWithJobs } | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [tipState, setTipState] = useState<{ userId: string; tip: string } | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const userId = node?.userId ?? null;

  const user = loaded?.userId === userId ? loaded.user : null;
  const error = !!userId && errorId === userId && !user;
  const loading = !!userId && !user && !error;

  // Load the target profile when the node changes.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchUserWithJobs(userId)
      .then((u) => {
        if (cancelled) return;
        if (!u) setErrorId(userId);
        else {
          setErrorId(null);
          setLoaded({ userId, user: u });
        }
      })
      .catch(() => !cancelled && setErrorId(userId));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Outside-click closes the panel (canvas stays interactive behind it — no backdrop).
  useEffect(() => {
    if (!node) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [node, onClose]);

  const parsedGoal = goal ? parseGoalRaw(goal.raw) : null;
  const relevantJobs =
    user && parsedGoal ? filterRelevantJobs(user.job_history, parsedGoal) : [];
  const commonalities: SharedContext[] =
    user && viewerProfile ? getSharedContext(viewerProfile, user) : [];

  // Fetch the AI talking point once per userId (cached). Cached value is read at render
  // time; the effect only performs the async fetch on a cache miss.
  useEffect(() => {
    if (!user || !userId) return;
    if (tipCache.has(userId)) return;
    let cancelled = false;
    fetch("/api/node/talking-points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalRaw: goal?.raw ?? "",
        viewerSummary: viewerSummary(viewerProfile),
        targetSummary: targetSummary(relevantJobs),
        sharedContext: commonalities,
      }),
    })
      .then((r) => r.json())
      .then((d: { tip?: string }) => {
        const t = d.tip ?? "Mention your shared background.";
        tipCache.set(userId, t);
        if (!cancelled) setTipState({ userId, tip: t });
      })
      .catch(() => {
        const t = "Mention your shared background.";
        tipCache.set(userId, t);
        if (!cancelled) setTipState({ userId, tip: t });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userId]);

  const tip =
    userId && tipCache.has(userId)
      ? tipCache.get(userId)!
      : tipState?.userId === userId
        ? tipState.tip
        : null;

  if (!node) return null;

  return (
    <aside
      ref={panelRef}
      data-testid="node-sidebar"
      aria-label="Connection profile"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        height: "100vh",
        width: SIDEBAR_WIDTH,
        background: LI.surface,
        boxShadow: "-2px 0 12px rgba(0,0,0,0.12)",
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
          justifyContent: "flex-end",
          borderBottom: `1px solid ${LI.border}`,
        }}
      >
        <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18 }}>
          ✕
        </button>
      </header>

      {loading && <SidebarSkeleton />}

      {error && !loading && (
        <div data-testid="sidebar-error" style={{ padding: 24, color: LI.textSecondary }}>
          User not found.
        </div>
      )}

      {user && !loading && (
        <div style={{ padding: 16 }}>
          {/* Profile header */}
          <section style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div
              data-testid="avatar-ring"
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: LI.bg,
                border: `3px solid ${alignmentColor(node.alignmentTier)}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                color: LI.text,
              }}
            >
              {node.avatarInitials}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{user.name}</h2>
              {user.job_history[0] && (
                <div style={{ color: LI.text }}>
                  {user.job_history[0].position} · {user.job_history[0].company}
                </div>
              )}
              <div style={{ color: LI.textSecondary, fontSize: 13 }}>{user.current_location}</div>
              <div style={{ color: alignmentColor(node.alignmentTier), fontSize: 13, fontWeight: 600 }}>
                {ALIGNMENT_LABELS[node.alignmentTier]}
              </div>
            </div>
          </section>

          {/* Experience */}
          <Section title="Experience">
            {relevantJobs.map((job, i) => (
              <div key={job.id || i} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>{job.position}</div>
                <div style={{ color: LI.textSecondary, fontSize: 13 }}>
                  {job.company} · <span>{job.level}</span> · {job.location}
                </div>
              </div>
            ))}
          </Section>

          <CareerTimelineSlot user={user} />

          {/* Commonalities — hidden entirely when empty */}
          {commonalities.length > 0 && (
            <Section title="What you have in common">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {commonalities.slice(0, 3).map((c, i) => (
                  <span
                    key={i}
                    data-testid="commonality-chip"
                    style={{
                      background: LI.bg,
                      border: `1px solid ${LI.border}`,
                      borderRadius: 16,
                      padding: "3px 10px",
                      fontSize: 12,
                    }}
                  >
                    {c.label}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* AI talking point */}
          {tip && (
            <Section title="">
              <div
                data-testid="talking-point"
                style={{
                  background: "#EAF3FB",
                  border: `1px solid ${LI.blue}`,
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 14,
                }}
              >
                💬 Try: &ldquo;{tip}&rdquo;
              </div>
            </Section>
          )}

          {/* 2nd-degree preview (Step 5), then Actions bar (Step 6). */}
          <SecondDegreePreview parentNode={node} parentName={user.name} />
          <ActionsBar targetName={user.name} tip={tip} />
        </div>
      )}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 20 }}>
      {title && <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>{title}</h3>}
      {children}
    </section>
  );
}

function SidebarSkeleton() {
  return (
    <div data-testid="sidebar-skeleton" style={{ padding: 16 }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#eee" }} />
      <div style={{ height: 16, background: "#eee", marginTop: 12, width: "60%" }} />
      <div style={{ height: 12, background: "#eee", marginTop: 8, width: "40%" }} />
    </div>
  );
}
