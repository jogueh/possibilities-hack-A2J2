"use client";
// W4-OWNED (stretch s11). "I met up" button for the W3 node sidebar Actions bar.
// Logging a real-world meetup strengthens the tie: the mount site wires `onLog`
// to the store's `updateInteractionScore(nodeId, edgeId, 20)`, which bumps the
// edge `strength` (0–100) and so warms/thickens the edge via the s12 visuals.
//
// Store-agnostic by design: it owns the button UI, the once-per-session disabled
// state, and the confirmation toast, but never imports a store — the W3 mount
// site supplies `onLog`. No API call, no localStorage; session memory only.
import { useEffect, useState } from "react";
import { LI } from "@/lib/linkedinTokens";

interface MetUpButtonProps {
  /**
   * Called once when the user logs a meetup. Wire this to the store, e.g.
   * `onLog={() => updateInteractionScore(node.id, edgeId, 20)}`.
   */
  onLog: () => void;
}

export function MetUpButton({ onLog }: MetUpButtonProps) {
  // Session-only: once logged, the button stays disabled for this mount.
  const [logged, setLogged] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleClick = () => {
    if (logged) return;
    onLog();
    setLogged(true);
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
