# LinkedIn Web
PIT Hackathon

A LinkedIn-inspired prototype built with **Next.js (App Router) + TypeScript + Ant Design 5**. Alongside a static homepage mockup, it includes an interactive **Web** feature: set a career goal and see how your network maps a warm path toward it.

### Presentation

📊 **[Slides](https://docs.google.com/presentation/d/1JEbf07Vd9cBJwBB0Oi8OZ3LaapymIsZCzgF90yeZmpk/edit?usp=sharing)**

### Team

- Jada Ogueh
- Jacob Ryabinky
- Arty Basilio
- Albert Yorn

### Prerequisites

- **Node.js** `>=20.9.0` (check with `node -v`)
- **npm** (ships with Node.js)

### Run the app & see the website

1. **Clone the repo and enter the folder:**

   ```sh
   git clone https://github.com/jogueh/possibilities-hack-A2J2.git
   cd possibilities-hack-A2J2
   ```

2. **Install dependencies:**

   ```sh
   npm install
   ```

3. **Start the development server:**

   ```sh
   npm run dev
   ```

4. **Open the website:** visit **http://localhost:3000** in your browser. The dev server hot-reloads as you edit files.

To stop the server, press `Ctrl+C` in the terminal.

### Production build (optional)

To run the app the way it would be deployed:

```sh
npm run build    # create an optimized production build
npm run start    # serve it at http://localhost:3000
```

### Other useful commands

```sh
npm run lint     # check code with ESLint
npm test         # run the Vitest test suite
```

### Routes

| Path             | Page                                                                 |
|------------------|----------------------------------------------------------------------|
| `/`              | Home — 3-column layout with profile, feed, and news                  |
| `/web`           | **Web** — interactive connection graph: enter a career goal, map your network, and explore warm paths. Nodes are colored by goal-match strength; clicking one opens a sidebar with the member's profile, AI-generated talking points, and job-overlap insights. |
| `/network`       | "My Network" placeholder                                             |
| `/jobs`          | "Jobs" placeholder                                                   |
| `/messaging`     | "Messaging" placeholder                                              |
| `/notifications` | "Notifications" placeholder                                          |
| `/me`            | "Me" placeholder                                                     |

### API routes

The Web feature is backed by server routes under `src/app/api/`:

| Endpoint                      | Method | Purpose                                                        |
|-------------------------------|--------|----------------------------------------------------------------|
| `/api/web/generate`           | POST   | Build the connection web for a viewer + parsed career goal     |
| `/api/user/[userId]`          | GET    | Fetch a member's full resolved profile (used by the sidebar)   |
| `/api/node/talking-points`    | POST   | Generate AI talking points for reaching out to a connection    |
| `/api/jobs/matches`           | POST   | Return job matches relevant to the goal / web                  |

### Structure

```
src/
├── app/                       # App Router pages + API routes
│   ├── layout.tsx             # AntdRegistry + ConfigProvider + TopNav
│   ├── page.tsx               # Home (3-column)
│   ├── web/                   # Connection-web ("Career GPS") page
│   ├── api/                   # Route handlers (web, user, talking-points, jobs)
│   └── {network,jobs,...}/    # Placeholder routes
├── components/                # UI components (TopNav, Feed, web/* canvas, etc.)
├── data/                      # Seed data (profile, posts, news, web_people, user_data)
├── lib/                       # Data layer, scoring, goal parsing, graph/web helpers
├── store/                     # Zustand store (useWebStore)
├── types/                     # Shared TypeScript types
├── test/                      # Shared test fixtures
└── theme.ts                   # Ant Design theme tokens
```

The homepage content (`profile`, `posts`, `news`) is hard-coded seed data in `src/data/`. The Web feature uses a small data layer in `src/lib/data.ts`: members come from the committed local `src/data/user_data.json` (the source of truth for connections), while jobs and courses are fetched once from the remote hackathon datasets and memoized.

### Note for contributors

`@ant-design/icons` modules are not marked `"use client"`, so any file importing an icon must itself start with `"use client"`. Otherwise, `next build` fails with `createContext is not a function` during page data collection.

