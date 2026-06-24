"use client";
// W4-OWNED. Briefcase toggle for the Jobs Panel. At integration this mounts in the
// top nav (W1); for now the standalone harness renders it. Inline SVG so it needs no
// icon-library "use client" boundary. See plan.md
import { LI } from "@/lib/linkedinTokens";

interface JobsPanelToggleProps {
  open: boolean;
  onClick: () => void;
  /** Number of matched jobs, shown as a small count badge when > 0. */
  count?: number;
}

export function JobsPanelToggle({ open, onClick, count = 0 }: JobsPanelToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={open}
      aria-label={`${open ? "Close" : "Open"} jobs panel${count > 0 ? `, ${count} matched job${count === 1 ? "" : "s"}` : ""}`}
      title="Jobs for your goal"
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 12px",
        borderRadius: 8,
        border: `1px solid ${open ? LI.blue : LI.border}`,
        background: open ? LI.blue : LI.surface,
        color: open ? LI.surface : LI.text,
        cursor: "pointer",
        fontWeight: 600,
        fontSize: 14,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" />
        <path d="M3 12h18" stroke="currentColor" strokeWidth="2" />
      </svg>
      Jobs
      {count > 0 && (
        <span
          aria-hidden="true"
          style={{
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: 9,
            background: open ? LI.surface : LI.blue,
            color: open ? LI.blue : LI.surface,
            fontSize: 11,
            lineHeight: "18px",
            textAlign: "center",
            fontWeight: 700,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
