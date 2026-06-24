// W3 provides this named placeholder; W4 mounts <CareerTimeline /> here. See plan.md
import type { UserWithJobs } from "@/types/data";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CareerTimelineSlot(_props: { user: UserWithJobs }) {
  // Intentionally empty: W4 replaces this with the CareerTimeline component.
  return <div data-testid="career-timeline-slot" />;
}
