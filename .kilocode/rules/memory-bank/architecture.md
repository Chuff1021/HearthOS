# System Patterns: HearthOS + GABE Platform

## Architecture Overview

```
src/
├── app/                    # Next.js App Router + admin/tech/API shell
├── components/             # UI components
├── lib/                    # App-side utilities
└── db/                     # Drizzle schema and DB client

services/
├── gabe-knowledge-engine/  # Existing retrieval backend kept alive during migration
├── gabe-orchestrator/      # New orchestration layer with internal engine modules
└── gabe-validator/         # Internal validator dependency for orchestrator
```

## Key Design Patterns

### 1. Strangler Migration for GABE

- Keep `gabe-knowledge-engine` alive as the retrieval backend during migration.
- Route new answer traffic through `gabe-orchestrator`.
- Make `gabe-validator` mandatory in the orchestrator answer path.
- Move category logic into orchestrator modules first, not separate deployable services.

### 2. Validator-First Technical Answers

- No technical answer leaves the orchestrator without validator approval.
- Run metadata carries certainty, run outcome, truth-audit status, and source-evidence status.
- `source_evidence_missing` is an official run outcome, not an ad hoc error case.

### 3. Category Engines as Internal Modules

- `venting`
- `wiring`
- `parts`
- `compliance`
- `general_retrieval`

These live inside `gabe-orchestrator/src/engines` until the architecture proves they need service separation.

### 4. App Router Pattern

Uses Next.js App Router with file-based routing:
```
src/app/
├── page.tsx           # Route: /
├── about/page.tsx     # Route: /about
├── blog/
│   ├── page.tsx       # Route: /blog
│   └── [slug]/page.tsx # Route: /blog/:slug
└── api/
    └── route.ts       # API Route: /api
```

### 5. Component Organization Pattern

```
src/components/
├── ui/                # Reusable UI components (Button, Card, etc.)
├── layout/            # Layout components (Header, Footer)
├── sections/          # Page sections (Hero, Features, etc.)
└── forms/             # Form components
```

### 6. Server Components by Default

All components are Server Components unless marked with `"use client"`:
```tsx
// Server Component (default) - can fetch data, access DB
export default function Page() {
  return <div>Server rendered</div>;
}

// Client Component - for interactivity
"use client";
export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

### 7. Layout Pattern

Layouts wrap pages and can be nested:
```tsx
// src/app/layout.tsx - Root layout
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

// src/app/dashboard/layout.tsx - Nested layout
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <Sidebar />
      <main>{children}</main>
    </div>
  );
}
```

## GABE Runtime Patterns

### Orchestrator Diagnostics

Every orchestrated run should expose:
- `engine_build_id`
- `engine_commit_sha`
- `engine_runtime_name`
- `selected_engine`
- `validator_version`

Debug-mode API responses can also expose:
- `certainty`
- `run_outcome`

### Truth-Audit Gating

No category is considered complete until it has:
- scorer coverage
- validator coverage
- truth-audit coverage

Public Chatwoot rollout is blocked until at least venting and wiring reach acceptable scorer-validated and truth-audited quality.

## Styling Conventions

### Tailwind CSS Usage
- Utility classes directly on elements
- Component composition for repeated patterns
- Responsive: `sm:`, `md:`, `lg:`, `xl:`

### Common Patterns
```tsx
// Container
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

// Responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

// Flexbox centering
<div className="flex items-center justify-center">
```

## File Naming Conventions

- Components: PascalCase (`Button.tsx`, `Header.tsx`)
- Utilities: camelCase (`utils.ts`, `helpers.ts`)
- Pages/Routes: lowercase (`page.tsx`, `layout.tsx`)
- Directories: kebab-case (`api-routes/`) or lowercase (`components/`)

## State Management

For simple needs:
- `useState` for local component state
- `useContext` for shared state
- Server Components for data fetching

For complex needs (add when necessary):
- Zustand for client state
- React Query for server state
