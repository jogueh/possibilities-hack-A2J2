# possibilities-hack-A2J2
PIT Hackathon

## LinkedIn Homepage Mockup

A visual mockup of the LinkedIn homepage built with **Next.js (App Router) + TypeScript + Ant Design 5**.

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

