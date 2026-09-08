import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";

async function harness(entry: string) {
  const fixture = {
    session: { userId: "clerk-test" as string | null },
    user: { primaryEmailAddressId: "email-test", emailAddresses: [{ id: "email-test", emailAddress: "tech@example.test", verification: { status: "verified" } }] },
    rows: [{ orgId: "org-test", employee: { id: "employee-test", email: "tech@example.test", role: "technician", isOwner: false, isActive: true, firstName: "Test", lastName: "Tech" } }],
    reads: 0,
    writes: [] as unknown[],
    authorization: "",
    jobs: [
      { id: "mine", assignedTechs: [{ id: "employee-test" }], scheduledDate: "2026-09-08", scheduledTimeStart: "09:00" },
      { id: "other", assignedTechs: [{ id: "employee-other" }], scheduledDate: "2026-09-08", scheduledTimeStart: "10:00" },
    ],
  };
  const mocks: Record<string, string> = {
    "server-only": "export {};",
    "react": "export const cache = fn => fn;",
    "@clerk/nextjs/server": "export const auth = async () => fixture.session; export const currentUser = async () => fixture.user; export const clerkClient = async () => ({users: {getUser: async () => fixture.user}});",
    "@/lib/auth": "export const isClerkConfigured = () => Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);",
    "next/headers": "export const headers = async () => new Headers({authorization: fixture.authorization});",
    "drizzle-orm": "export const and = () => null; export const eq = () => null; export const sql = () => null;",
    "@/db": `export const users = {}; export const organizations = {};
      const query = { from: () => query, innerJoin: () => query, where: () => query, limit: async () => fixture.rows };
      export const db = { select: () => query };`,
    "next/server": "export const NextResponse = Response;",
    "@/lib/job-store": `
      export const listJobs = async () => { fixture.reads++; return fixture.jobs; };
      export const getJob = async id => { fixture.reads++; return fixture.jobs.find(job => job.id === id); };
      export const updateJobRecord = async (id, updates) => { fixture.writes.push({id, updates}); return {...fixture.jobs.find(job => job.id === id), ...updates}; };
      export const createJobRecord = async data => { fixture.writes.push(data); return data; };
      export const deleteJobRecord = async id => { fixture.writes.push(id); return true; };`,
  };
  const result = await build({
    entryPoints: [entry], bundle: true, write: false, platform: "node", format: "cjs", external: ["node:crypto"],
    plugins: [{ name: "isolated-fixtures", setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => {
        if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: "fixtures" };
        if (args.path.startsWith("@/") && !args.path.startsWith("@/lib/security/")) throw new Error(`Unmocked application dependency: ${args.path}`);
      });
      builder.onLoad({ filter: /.*/, namespace: "fixtures" }, (args) => ({ contents: mocks[args.path], loader: "js" }));
    } }],
  });
  const env: Record<string, string> = { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "test", CLERK_SECRET_KEY: "test" };
  const loaded = { exports: {} as Record<string, (...args: any[]) => Promise<any>> };
  runInNewContext(result.outputFiles[0].text, { module: loaded, exports: loaded.exports, fixture, process: { env }, Response, Request, Headers, URL, Buffer, console, require: createRequire(import.meta.url) });
  return { fixture, env, api: loaded.exports };
}

test("real access guard rejects missing auth, unknown, duplicate, inactive, and unverified staff", async () => {
  const { fixture, env, api } = await harness("src/lib/security/crm-access.ts");
  delete env.CLERK_SECRET_KEY;
  assert.equal((await api.authorizeCrmApi("/api/jobs", "GET")).status, 503);
  env.CLERK_SECRET_KEY = "test";
  fixture.session.userId = null;
  assert.equal((await api.authorizeCrmApi("/api/jobs", "GET")).status, 401);
  fixture.session.userId = "clerk-test";
  const member = fixture.rows[0];
  fixture.rows = [];
  assert.equal((await api.authorizeCrmApi("/api/jobs", "GET")).status, 403);
  fixture.rows = [member, member];
  assert.equal((await api.authorizeCrmApi("/api/jobs", "GET")).status, 403);
  fixture.rows = [member];
  member.employee.isActive = false;
  assert.equal((await api.authorizeCrmApi("/api/jobs", "GET")).status, 403);
  member.employee.isActive = true;
  fixture.user.emailAddresses[0].verification.status = "unverified";
  assert.equal((await api.authorizeCrmApi("/api/jobs", "GET")).status, 403);
  fixture.user.emailAddresses[0].verification.status = "verified";
  assert.equal(await api.authorizeCrmApi("/api/jobs", "GET"), null);
  assert.equal((await api.authorizeCrmApi("/api/jobs", "DELETE")).status, 403);
  assert.equal(fixture.writes.length, 0);
});

test("cron requires configured credentials and an exact bearer token", async () => {
  const { fixture, env, api } = await harness("src/lib/security/cron-access.ts");
  assert.equal((await api.authorizeCron()).status, 503);
  env.CRON_SECRET = "synthetic-test-secret";
  fixture.authorization = "Bearer wrong";
  assert.equal((await api.authorizeCron()).status, 401);
  fixture.authorization = "Bearer synthetic-test-secret";
  assert.equal(await api.authorizeCron(), null);
});

test("Meeks partner cannot gain office access through metadata or unverified email", async () => {
  const { fixture, env, api } = await harness("src/lib/meeks-auth.ts");
  fixture.rows = [];
  Object.assign(fixture.user, { unsafeMetadata: { hearthRole: "owner", techId: "employee-owner" } });
  assert.equal((await api.getMeeksApiAccess()).ok, false);
  fixture.user.emailAddresses[0].emailAddress = "shawn.garvey@meeks.com";
  const partner = await api.getMeeksApiAccess();
  assert.equal(partner.ok, true);
  assert.equal(partner.isMeeksPartner, true);
  assert.equal(partner.isInternal, false);
  assert.equal((await api.getMeeksInternalAccess()).ok, false);
  fixture.user.emailAddresses[0].verification.status = "unverified";
  assert.equal((await api.getMeeksApiAccess()).ok, false);
  delete env.CLERK_SECRET_KEY;
  assert.equal((await api.getMeeksApiAccess()).ok, false);
});

test("real jobs handlers deny unauthenticated storage reads and enforce technician ownership", async () => {
  const { fixture, api } = await harness("src/app/api/jobs/route.ts");
  fixture.session.userId = null;
  assert.equal((await api.GET(new Request("https://example.test/api/jobs"))).status, 401);
  assert.equal(fixture.reads, 0);
  fixture.session.userId = "clerk-test";
  const response = await api.GET(new Request("https://example.test/api/jobs?techId=employee-other"));
  assert.equal((await response.json()).jobs.length, 0);
  const own = await api.GET(new Request("https://example.test/api/jobs"));
  assert.deepEqual((await own.json()).jobs.map((job: { id: string }) => job.id), ["mine"]);
  const update = (body: unknown) => api.PUT(new Request("https://example.test/api/jobs", { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
  assert.equal((await update({ id: "other", status: "completed" })).status, 404);
  assert.equal((await update({ id: "mine", assignedTechs: [{ id: "employee-other" }] })).status, 403);
  assert.equal((await update({ id: "mine", status: "made-up" })).status, 400);
  assert.equal(fixture.writes.length, 0);
  const completed = await update({ id: "mine", status: "completed", completedAt: "forged-time" });
  assert.equal(completed.status, 200);
  assert.notEqual((await completed.json()).job.completedAt, "forged-time");
  assert.equal(fixture.writes.length, 1);
});
