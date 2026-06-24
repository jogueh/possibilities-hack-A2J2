"use client";
// W4-OWNED (stretch s11). "I met up" button for the W3 node sidebar Actions bar.
// Logging a real-world meetup strengthens the tie: the mount site wires `onLog`
// to a boardState `logMeetup` dispatch, which bumps the rendered edge to full
// strength and so warms/thickens the edge via the s12 visuals.
//
// Store-agnostic by design: it owns the button UI and the confirmation toast,
// but never imports a store — the W3 mount site supplies `onLog`. No API call,
// no localStorage; the once-per-session "already logged" flag lives in a
// module-level Set keyed by `edgeId`, so it survives the sidebar unmounting and
// remounting (close + reopen) for the lifetime of the page session.
import { useEffect, useState } from "react";
import { LI } from "@/lib/linkedinTokens";

// Edges whose meetup has been logged this session. Module-level (not component
// state) so the flag persists across sidebar unmount/remount. Mirrors
// NodeSidebar's module-level tipCache pattern.
const loggedMeetups = new Set<string>();

// Test/dev helper — clears the session meetup log. NOT part of any planned API.
export function __resetMetUpLog() {
  loggedMeetups.clear();
}

interface MetUpButtonProps {
  /** Id of the edge this meetup strengthens; also the per-session dedupe key. */
  edgeId: string;
  /**
   * Called once when the user logs a meetup. The mount site wires this to a
   * boardState `logMeetup` dispatch, e.g. `onLog={() => onLogMeetup(node.id)}`.
   */
  onLog: () => void;
}

export function MetUpButton({ edgeId, onLog }: MetUpButtonProps) {
  const [toast, setToast] = useState<string | null>(null);

  // Derived from the module-level log, so a remount (close + reopen) stays
  // disabled and switching to a different edge re-enables — no extra state to
  // keep in sync. The click below re-renders via setToast.
  const logged = loggedMeetups.has(edgeId);

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleClick = () => {
    if (logged) return;
    loggedMeetups.add(edgeId);
    onLog();
    setToast("🤝 Connection logged!");
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={logged}
        aria-pressed={logged}
        style={{
          marginTop: 8,
          width: "100%",
          borderRadius: 20,
          padding: "8px 0",
          fontWeight: 600,
          background: "transparent",
          color: logged ? LI.textSecondary : LI.green,
          border: `1px solid ${logged ? LI.border : LI.green}`,
          cursor: logged ? "default" : "pointer",
        }}
      >
        {logged ? "✓ Met up logged" : "🤝 I met up with this person"}
      </button>

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: LI.green,
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 8,
            zIndex: 1100,
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
