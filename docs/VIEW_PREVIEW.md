# HearthOS Local Preview Runbook

This runbook is the fastest known-good path to preview `feat/hearthos-next-level` locally.

## What QA found

- ✅ `npm run lint` passes (after removing one stale eslint-disable comment)
- ✅ `npm run typecheck` passes
- ✅ `npm run build` passes
- ⚠️ **Runtime blocker if DB is missing:** `DATABASE_URL` is required for API routes that import `@/db` (notably todos + tech timeclock). Without it, DB migration and those flows fail.
- ℹ️ Clerk can run in keyless mode locally; auth-dependent flows still have fallback behavior in these routes.

---

## 1) Start Postgres for local preview

If you already have Postgres, skip to step 2 and point `DATABASE_URL` at it.

```bash
# from anywhere

docker rm -f hearthos-preview-db 2>/dev/null || true

docker run -d \
  --name hearthos-preview-db \
  -e POSTGRES_USER=hearthos \
  -e POSTGRES_PASSWORD=hearthos \
  -e POSTGRES_DB=hearthos \
  -p 55432:5432 \
  postgres:16-alpine
```

Connection string:

```bash
export DATABASE_URL='postgresql://hearthos:hearthos@localhost:55432/hearthos'
```

---

## 2) Install deps + migrate DB

```bash
cd /root/HearthOS
npm install
npm run db:migrate
```

> If `npm run db:migrate` errors with `url: undefined`, `DATABASE_URL` is not set in your shell.

---

## 3) Optional minimal demo seed (for preview)

There is no dedicated seed script yet. Use API calls after the dev server starts (step 4).

---

## 4) Run the app

```bash
cd /root/HearthOS
npm run dev
```

Open: `http://localhost:3000`

---

## 5) Validate key flows (exact checks)

Run these in another terminal while dev server is running:

### A) Dashboard flow

```bash
curl -sS http://localhost:3000/api/dashboard | jq
```

Expect: JSON with `stats`, `recentCustomers`, `recentActivity`.

### B) Todos flow (create + list)

```bash
# create one todo
curl -sS -X POST http://localhost:3000/api/todos \
  -H 'content-type: application/json' \
  --data '{
    "title":"QA demo todo",
    "description":"created for local preview",
    "priority":"high",
    "assignedTo":"system-tech",
    "assignedToName":"Demo Tech"
  }' | jq

# list todos
curl -sS http://localhost:3000/api/todos | jq
```

Expect: create returns `201` with `todo.id`; list includes that todo.

### C) Tech clock in/out flow

```bash
# status before
curl -sS http://localhost:3000/api/tech/timeclock | jq

# clock in
curl -sS -X POST http://localhost:3000/api/tech/timeclock \
  -H 'content-type: application/json' \
  --data '{"action":"clock_in"}' | jq

# status should be clocked in
curl -sS http://localhost:3000/api/tech/timeclock | jq

# clock out
curl -sS -X POST http://localhost:3000/api/tech/timeclock \
  -H 'content-type: application/json' \
  --data '{"action":"clock_out"}' | jq

# status should be clocked out
curl -sS http://localhost:3000/api/tech/timeclock | jq
```

Expect: `isClockedIn` toggles `false -> true -> false`.

---

## 6) Quick UI smoke pages

- `http://localhost:3000/` (Dashboard)
- `http://localhost:3000/todos`
- `http://localhost:3000/tech`

All should render without runtime errors when `DATABASE_URL` is set and migrations are applied.

---

## Known preview caveats (non-blocking)

- Clerk may print a local keyless-mode banner in dev logs.
- Some modules/pages still use mock/in-memory data by design; this does not block local preview of the requested flows.
