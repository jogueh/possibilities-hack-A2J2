"use client";
// W3-OWNED. Actions bar at the bottom of the node sidebar: Connect + InMail.
// UI-only — no real LinkedIn API calls. See plan.md
import { useEffect, useState } from "react";
import type { DegreeLevel } from "@/types/web";
import { LI } from "@/lib/linkedinTokens";

interface ActionsBarProps {
  targetName: string;
  /** Degree of the open node. 1st-degree people are already connected, so the
   *  Connect button is hidden for them. */
  degree?: DegreeLevel;
  /** True once the viewer has connected with this (2nd-degree) person. */
  connected?: boolean;
  /** True when the viewer has hit the free-tier connection cap (premium gate). */
  atConnectionLimit?: boolean;
  /** Called when a connection request is confirmed; promotes the person on the web. */
  onConnect?: () => void;
  /** Surfaces an "Upgrade to Premium" prompt (InMail is premium; cap is reached). */
  onUpgrade?: (reason: "connection" | "inmail") => void;
}

export function ActionsBar({
  targetName,
  degree,
  connected,
  atConnectionLimit,
  onConnect,
  onUpgrade,
}: ActionsBarProps) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const btn: React.CSSProperties = {
    flex: 1,
    borderRadius: 20,
    padding: "8px 0",
    fontWeight: 600,
    cursor: "pointer",
  };

  // Connect is gated by the free-tier connection cap: past the limit the button
  // prompts an upgrade instead of opening the confirmation dialog.
  const handleConnectClick = () => {
    if (atConnectionLimit) {
      onUpgrade?.("connection");
      return;
    }
    setConnectOpen(true);
  };

  return (
    <section style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${LI.border}` }}>
      <div style={{ display: "flex", gap: 8 }}>
        {/* 1st-degree people are already connections — no Connect button. */}
        {degree !== 1 &&
          (connected ? (
            <button
              type="button"
              disabled
              style={{ ...btn, background: LI.green, color: "#fff", border: "none", cursor: "default" }}
            >
              Connected ✓
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnectClick}
              style={{ ...btn, background: LI.blue, color: "#fff", border: "none" }}
            >
              Connect
            </button>
          ))}
        {/* InMail is a LinkedIn Premium feature — always gated behind upgrade. */}
        <button
          type="button"
          onClick={() => onUpgrade?.("inmail")}
          style={{ ...btn, background: "transparent", color: LI.blue, border: `1px solid ${LI.blue}` }}
        >
          <span aria-hidden="true">🔒</span> InMail
        </button>
      </div>

      {connectOpen && (
        <Modal title="Connect" onClose={() => setConnectOpen(false)}>
          <p>Send {targetName} a connection request?</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setConnectOpen(false)}>Cancel</button>
            <button
              type="button"
              onClick={() => {
                onConnect?.();
                setToast(`Connection request sent to ${targetName}`);
                setConnectOpen(false);
              }}
              style={{ background: LI.blue, color: "#fff", border: "none", borderRadius: 16, padding: "4px 14px", fontWeight: 600 }}
            >
              Send
            </button>
          </div>
        </Modal>
      )}

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
    </section>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Close on Escape for keyboard accessibility.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1050,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{ background: LI.surface, borderRadius: 10, padding: 20, width: 320, maxWidth: "90%" }}
      >
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}
