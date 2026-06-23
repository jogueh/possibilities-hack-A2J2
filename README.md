# possibilities-hack-A2J2
PIT Hackathon

## LinkedIn Homepage Mockup

A visual mockup of the LinkedIn homepage built with **Next.js (App Router) + TypeScript + Ant Design 5**.

### Run

```sh
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
```

### Routes

| Path             | Page                                          |
|------------------|-----------------------------------------------|
| `/`              | Home — 3-column layout with profile, feed, news |
| `/network`       | "My Network" placeholder                      |
| `/jobs`          | "Jobs" placeholder                            |
| `/messaging`     | "Messaging" placeholder                       |
| `/notifications` | "Notifications" placeholder                   |
| `/me`            | "Me" placeholder                              |

### Structure

```
src/
├── app/                       # App Router pages
│   ├── layout.tsx             # AntdRegistry + ConfigProvider + TopNav
│   ├── page.tsx               # Home (3-column)
│   └── {network,jobs,...}/    # Placeholder routes
├── components/                # UI components (TopNav, ProfileCard, Feed, etc.)
├── data/                      # Mock data (profile, posts, news)
└── theme.ts                   # Ant Design theme tokens
```

All content is hard-coded mock data in `src/data/`. No backend yet — the structure is set up so API routes (`src/app/api/*/route.ts`) or server actions can be added alongside the UI.

### Note for contributors

`@ant-design/icons` modules are not marked `"use client"`, so any file importing an icon must itself start with `"use client"`. Otherwise, `next build` fails with `createContext is not a function` during page data collection.

