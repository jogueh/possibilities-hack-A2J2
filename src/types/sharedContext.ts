// W3-OWNED type. Canonical location — NOT a mock. See plan.md
// Shared context (commonalities) between the viewer and a target connection.

export interface SharedContext {
  type: "school" | "company" | "skill" | "location";
  label: string; // e.g. "Both attended UC Berkeley", "Both worked at Google"
}
