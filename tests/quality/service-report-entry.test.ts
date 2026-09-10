import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";

const stubs: Record<string, string> = {
  "@/lib/job-store": "export async function getJob(){return globalThis.fixture.job}",
  "@/lib/security/crm-access": "export async function requireCrmActor(){if(globalThis.fixture.denied)throw Error('unauthenticated');return globalThis.fixture.actor}",
  "@/components/service-reports/ServiceReportEditor": "export default function Editor({jobId}){return <div data-current-form={jobId}/>}",
  "next/link": "export default function Link({href,children,...rest}){return <a href={href} {...rest}>{children}</a>}",
  "next/navigation": "export function notFound(){throw Error('not found')}",
  "./AutoPrint": "export default function AutoPrint({enabled}){return <span data-auto-print={String(enabled)}/>}",
};
const compiled = build({
  entryPoints: ["src/app/tech/job/[jobId]/report/page.tsx"], bundle: true, write: false,
  platform: "node", format: "cjs", jsx: "automatic", external: ["react", "react/jsx-runtime"],
  plugins: [{ name: "isolated-report-entry", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: "fixture" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "jsx" }));
  } }],
});

async function renderEntry(templateId: string, query: Record<string, string> = {}, options: { denied?: boolean; technician?: boolean } = {}) {
  const fixture = {
    denied: options.denied,
    actor: { role: options.technician ? "technician" : "owner", employeeId: "tech-one" },
    job: { id: "synthetic-job", jobNumber: "TEST-1", customerName: "Synthetic Customer", title: "Synthetic service",
      assignedTechs: [], propertyAddress: "Synthetic address", scheduledDate: "2026-09-10", photos: [],
      checklistForm: { templateId, values: {} } },
  };
  const before = JSON.stringify(fixture.job);
  const loaded = { exports: {} as { default: (props: unknown) => Promise<React.ReactNode> } };
  runInNewContext((await compiled).outputFiles[0].text, {
    module: loaded, exports: loaded.exports, require: createRequire(import.meta.url), fixture,
  });
  const html = renderToStaticMarkup(await loaded.exports.default({ params: Promise.resolve({ jobId: "synthetic-job" }), searchParams: Promise.resolve(query) }));
  assert.equal(JSON.stringify(fixture.job), before, "Opening a report must not mutate the saved job");
  return html;
}

for (const template of ["gas-service", "wood-clean", "pellet-clean"]) {
  test(`${template}: cached Generate PDF links open the current form without printing old content`, async () => {
    const html = await renderEntry(template, { print: "1" });
    assert.match(html, /data-current-form="synthetic-job"/);
    assert.doesNotMatch(html, /data-auto-print|Print \/ Save PDF/);
    assert.match(html, /legacy=1/);
  });
}
test("previous checklist printing requires an explicit archive request", async () => {
  const html = await renderEntry("gas-service", { legacy: "1", print: "1" });
  assert.match(html, /Previous checklist/);
  assert.match(html, /data-auto-print="true"/);
  assert.doesNotMatch(html, /data-current-form/);
});
test("installation checklist printing remains unchanged", async () => {
  const html = await renderEntry("gas-install", { print: "1" });
  assert.match(html, /data-auto-print="true"/);
  assert.doesNotMatch(html, /data-current-form/);
});
test("current and archived report entry points retain authentication and job assignment checks", async () => {
  for (const query of [{ print: "1" }, { legacy: "1" }]) {
    await assert.rejects(renderEntry("gas-service", query, { denied: true }), /unauthenticated/);
    await assert.rejects(renderEntry("gas-service", query, { technician: true }), /not found/);
  }
});
