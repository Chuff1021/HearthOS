# Technical Context: HearthOS + GABE

## Technology Stack

| Technology        | Version | Purpose                                  |
| ----------------- | ------- | ---------------------------------------- |
| Next.js           | 16.x    | React framework with App Router          |
| React             | 19.x    | UI library                               |
| TypeScript        | 5.9.x   | Type-safe JavaScript                     |
| Tailwind CSS      | 4.x     | Utility-first CSS                        |
| Bun               | Latest  | App package manager & runtime            |
| Drizzle ORM       | 0.45.x  | Postgres schema and queries              |
| postgres-js       | 3.4.x   | Postgres client                          |
| Fastify           | 5.x     | GABE service HTTP runtime                |
| Qdrant            | latest  | Vector retrieval                         |
| Docling           | planned | PDF/manual parsing in doc intelligence   |
| LangGraph         | planned | GABE orchestration runtime               |

## Development Environment

### Prerequisites

- Bun installed (`curl -fsSL https://bun.sh/install | bash`)
- Node.js 20+ (for compatibility)

### Commands

```bash
bun install        # Install dependencies
bun dev            # Start dev server (http://localhost:3000)
bun build          # Production build
bun start          # Start production server
bun lint           # Run ESLint
bun typecheck      # Run TypeScript type checking
```

Service commands:

```bash
cd services/gabe-knowledge-engine && npm run dev
cd services/gabe-orchestrator && npm run dev
cd services/gabe-validator && npm run build
docker compose -f docker-compose.gabe.yml up -d --build
```

## Project Configuration

### Next.js Config (`next.config.ts`)

- App Router enabled
- Default settings for flexibility

### TypeScript Config (`tsconfig.json`)

- Strict mode enabled
- Path alias: `@/*` → `src/*`
- Target: ESNext

### Tailwind CSS 4 (`postcss.config.mjs`)

- Uses `@tailwindcss/postcss` plugin
- CSS-first configuration (v4 style)

### ESLint (`eslint.config.mjs`)

- Uses `eslint-config-next`
- Flat config format

## GABE Service Topology

- `services/gabe-knowledge-engine`: existing retrieval backend
- `services/gabe-orchestrator`: new workflow entrypoint
- `services/gabe-validator`: internal validator dependency used by orchestrator

Initial Qdrant collection set:
- `fireplace_manual_chunks`
- `fireplace_qa_memory`
- `fireplace_vent_rules`
- `fireplace_wiring_graphs`

Run metadata/debug fields introduced in Phase 1:
- `engine_build_id`
- `engine_commit_sha`
- `engine_runtime_name`
- `selected_engine`
- `validator_version`
- `certainty`
- `run_outcome`
- `truth_audit_status`

## Key Dependencies

### Production Dependencies

```json
{
  "next": "^16.1.3", // Framework
  "react": "^19.2.3", // UI library
  "react-dom": "^19.2.3", // React DOM
  "drizzle-orm": "^0.45.1", // ORM
  "postgres": "^3.4.8" // DB client
}
```

### Dev Dependencies

```json
{
  "typescript": "^5.9.3",
  "@types/node": "^24.10.2",
  "@types/react": "^19.2.7",
  "@types/react-dom": "^19.2.3",
  "@tailwindcss/postcss": "^4.1.17",
  "tailwindcss": "^4.1.17",
  "eslint": "^9.39.1",
  "eslint-config-next": "^16.0.0"
}
```

## File Structure

```
/
├── .gitignore              # Git ignore rules
├── package.json            # Dependencies and scripts
├── bun.lock                # Bun lockfile
├── next.config.ts          # Next.js configuration
├── tsconfig.json           # TypeScript configuration
├── postcss.config.mjs      # PostCSS (Tailwind) config
├── eslint.config.mjs       # ESLint configuration
├── public/                 # Static assets
│   └── .gitkeep
└── src/                    # Source code
    └── app/                # Next.js App Router
        ├── layout.tsx      # Root layout
        ├── page.tsx        # Home page
        ├── globals.css     # Global styles
        └── favicon.ico     # Site icon
```

## Technical Constraints

### GABE Constraints

- `gabe-validator` is mandatory in the orchestrator answer path.
- `gabe-knowledge-engine` remains alive during migration; do not rewrite it out yet.
- Public Chatwoot rollout is blocked until venting and wiring are scorer-validated and truth-audited to an acceptable level.
- Source-evidence audit classification is a first-class workflow for incomplete answers.

### Browser Support

- Modern browsers (ES2020+)
- No IE11 support

## Performance Considerations

### Image Optimization

- Use Next.js `Image` component for optimization
- Place images in `public/` directory

### Bundle Size

- Tree-shaking enabled by default
- Tailwind CSS purges unused styles

### Core Web Vitals

- Server Components reduce client JavaScript
- Streaming and Suspense for better UX

## Deployment

### Build Output

- Server-rendered pages by default
- Can be configured for static export

### Environment Variables

- None required for base template
- Add as needed for features
- Use `.env.local` for local development
