"use client";
// W3-OWNED. Actions bar at the bottom of the node sidebar: Connect + Message.
// UI-only — no real LinkedIn API calls. See plan.md
import { useEffect, useState } from "react";
import { LI } from "@/lib/linkedinTokens";

interface ActionsBarProps {
  targetName: string;
  tip?: string | null; // AI talking point used to pre-fill the message subject
}

export function ActionsBar({ targetName, tip }: ActionsBarProps) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // Pre-fill the subject from the AI talking point and clear the body when opening the composer.
  const openMessage = () => {
    setSubject(tip ? tip : `Connecting with you, ${targetName}`);
    setBody("");
    setMessageOpen(true);
  };

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

  return (
    <section style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${LI.border}` }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => setConnectOpen(true)}
          style={{ ...btn, background: LI.blue, color: "#fff", border: "none" }}
        >
          Connect
        </button>
        <button
          type="button"
          onClick={openMessage}
          style={{ ...btn, background: "transparent", color: LI.blue, border: `1px solid ${LI.blue}` }}
        >
          Message
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

      {messageOpen && (
        <Modal title={`Message ${targetName}`} onClose={() => setMessageOpen(false)}>
          <label style={{ display: "block", fontSize: 12, color: LI.textSecondary }}>Subject</label>
          <input
            aria-label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ width: "100%", marginBottom: 8, padding: 6 }}
          />
          <label style={{ display: "block", fontSize: 12, color: LI.textSecondary }}>Message</label>
          <textarea
            aria-label="Message body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            style={{ width: "100%", marginBottom: 8, padding: 6 }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setMessageOpen(false)}>Cancel</button>
            <button
              type="button"
              onClick={() => {
                setToast(`Message sent to ${targetName}`);
                setMessageOpen(false);
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
