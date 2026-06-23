# LinkedIn Web — Hackathon Project Overview

> *"Expand your web, reinforce its roots. Keep weaving. Keep connecting."*

---

## The Problem

LinkedIn connections have become performative. Gen-Z and Gen-Alpha users accumulate connections to watch the number go up, but the platform makes it genuinely hard to tap into those connections for real career outcomes. The result: large networks with shallow roots, little actionability, and an interface that feels inauthentic to a generation that values genuine relationships.

At the same time, younger users entering the workforce lack the credibility signals and warm introductions that make job searching and networking effective. Cold applications go nowhere. The existing tools don't bridge the gap between "I know someone" and "that person can actually help me."

---

## The Solution — LinkedIn Web

An AI-powered relationship web that uses your career goals and existing connections to surface the next best people to meet — with visual context, warm talking points, and ongoing incentives to keep nurturing your network.

The core insight: **structure makes authenticity possible.** When you give your networking a clear goal and a visual map, every connection becomes meaningful rather than decorative.

---

## User Flow

```
Define a goal  →  AI seeds your web  →  Explore connections  →  Reach out with context  →  Strengthen your web over time
```

1. **State A — Empty Web:** The canvas is blank. You're prompted to define a career goal (e.g. "I want to break into software engineering in the Bay Area"). AI suggestion chips help you get started based on your profile context.

2. **State B — First Connection Seed:** The AI parses your goal and surfaces the 5 most relevant first-degree connections as nodes radiating from you. You can toggle between 1–5 nodes. Click any connection to see which parts of their profile are relevant to your goal and get a personalized, AI-generated outreach tip.

3. **State C — Expanded Web:** Second-degree connections appear as dotted nodes extending beyond your direct contacts. A goal proximity metric gives you a read on how well-positioned your current web is. You can hide nodes, take notes, and continuously refine.

---

## Key Features

### 🕸️ Goal-Scoped Web
The graph is never generic — it's always anchored to a specific goal. Switching goals generates a new web. Every node shown is there because it's relevant to where you're trying to go.

### 🤖 AI Connection Intelligence
When you open a node, the AI doesn't just show you a profile — it tells you:
- Which parts of their background are relevant to your goal
- What you have in common (shared school, company, skills, location)
- A concrete, personalized opener: *"You both attended UC Berkeley — mention your shared time in the CS program"*

### 🔗 Link Strength Dynamics
Edges on the web aren't static. They visually strengthen as you interact with connections — logging meetups, messaging, collaborating. A strong edge glows. A cold one fades. Your web reflects reality.

### 🔵 Activity Status Rings
Profile node avatars display a colored ring:
- **Blue** — Very active, great time to reach out
- **Amber** — Somewhat active, worth a nudge
- **Red** — Quiet — lead with shared context

### 🔥 Streaks & Badges
Daily engagement keeps your streak alive. Badges reward quality over quantity:
- 🌱 First Seed — generated your first web
- 🕸️ Web Weaver — added 3+ second-degree connections
- 🤝 Connector — logged 3+ meetups
- ⚔️ Connection Warrior — all 5 first-degree nodes have interaction history

### 📝 Notes per Connection
Private or public annotations on any node. Jot down what you talked about, what to follow up on, or why this person matters to your goal.

---

## Data & AI Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React, TypeScript |
| Graph Visualization | React Flow (`@xyflow/react`) |
| Styling | Tailwind CSS + shadcn/ui |
| State Management | Zustand |
| Animations | Framer Motion |
| AI / LLM | OpenRouter → `openai/gpt-4o-mini` via Vercel AI SDK |
| Connection Data | [pit.najera.cc](https://pit.najera.cc) — 2,000 user profiles, job postings, courses (no auth) |
| Persistence | `localStorage` (MVP scope) |

---

## Architecture — 4 Parallel Workflows

The implementation is split into 4 independently shippable tracks. See `plan/features/` for detailed scope docs.

```
plan/
└── features/
    ├── workflow-1-graph-canvas/     # App shell, React Flow canvas, state machine, shared types
    ├── workflow-2-ai-data-layer/    # Dataset fetching, relevance scoring, AI goal parser API
    ├── workflow-3-node-profile-card/# Click-node panel, talking points, 2nd-degree unlock
    └── workflow-4-gamification/     # Edge strength, activity rings, streaks, badges, notes
```

The shared contract is `src/types/web.ts` — defined in Workflow 1 on day one. All other workflows consume it. No workflow modifies another's core logic.

---

## What This Is NOT (MVP Boundaries)

- ❌ Not a real LinkedIn integration — no OAuth, no live profile data, no sending messages
- ❌ Not a mobile app — desktop web only for the hackathon
- ❌ Not a database-backed product — all state lives in `localStorage`
- ❌ Not a feed, job board, or messaging clone — the web canvas is the entire product surface

---

## Who It's For

**Primary user:** A college student or recent grad (Gen-Z) who knows they need to network to get their first industry role but finds LinkedIn overwhelming, performative, and hard to act on.

**The job to be done:** Turn a vague career aspiration into a concrete set of people to talk to, with the context and confidence to actually reach out.
