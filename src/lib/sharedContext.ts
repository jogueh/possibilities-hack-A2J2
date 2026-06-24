// W3-OWNED. Client-side commonalities detection between viewer and target. See plan.md
import type { UserWithJobs } from "@/types/data";
import type { SharedContext } from "@/types/sharedContext";

function norm(s: string): string {
  return s.toLowerCase().trim();
}

function companies(user: UserWithJobs): string[] {
  return user.job_history.map((j) => j.company);
}

function city(location: string): string {
  return norm(location.split(",")[0] ?? "");
}

/**
 * Detects shared context (school / company / skill / location) between the viewer and a
 * target connection. Pure, no I/O. Returns a deduplicated list; empty when nothing is shared.
 */
export function getSharedContext(
  viewer: UserWithJobs,
  target: UserWithJobs,
): SharedContext[] {
  const out: SharedContext[] = [];
  const seen = new Set<string>();

  const push = (ctx: SharedContext) => {
    const key = `${ctx.type}:${norm(ctx.label)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(ctx);
  };

  // School overlap
  const targetSchools = new Set(
    target.school_history.map((s) => norm(s.school_name)),
  );
  for (const s of viewer.school_history) {
    if (targetSchools.has(norm(s.school_name))) {
      push({ type: "school", label: `Both attended ${s.school_name}` });
    }
  }

  // Company overlap (resolved job histories)
  const targetCompanies = new Set(companies(target).map(norm));
  for (const c of companies(viewer)) {
    if (targetCompanies.has(norm(c))) {
      push({ type: "company", label: `Both worked at ${c}` });
    }
  }

  // Skill overlap
  const targetSkills = new Set(target.skills.map(norm));
  for (const skill of viewer.skills) {
    if (targetSkills.has(norm(skill))) {
      push({ type: "skill", label: `Shared skill: ${skill}` });
    }
  }

  // Location overlap (same city)
  if (city(viewer.current_location) && city(viewer.current_location) === city(target.current_location)) {
    push({
      type: "location",
      label: `Both based in ${target.current_location.split(",")[0]?.trim()}`,
    });
  }

  return out;
}
