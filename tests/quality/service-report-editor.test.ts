import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

const compiled = build({
  entryPoints: ["src/components/service-reports/ServiceReportEditor.tsx"],
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
  external: ["react", "react/jsx-runtime", "lucide-react"],
});

async function compressionFixture({ decode = true, context = true, sizes = [300_000] }: { decode?: boolean; context?: boolean; sizes?: (number | null)[] } = {}) {
  const calls: { type: string; quality: number; width: number; height: number }[] = [];
  const revoked: string[] = [];
  let canvas: { width: number; height: number; getContext: () => unknown; toBlob: (callback: (blob: Blob | null) => void, type: string, quality: number) => void };
  const loaded = { exports: {} as { compressServicePhoto: (file: File) => Promise<Blob> } };
  runInNewContext((await compiled).outputFiles[0].text, {
    module: loaded, exports: loaded.exports, require: createRequire(import.meta.url),
    URL: { createObjectURL: () => "blob:synthetic-photo", revokeObjectURL: (url: string) => revoked.push(url) },
    Image: class {
      naturalWidth = 4000; naturalHeight = 3000;
      onload = () => {}; onerror = () => {};
      set src(_value: string) { if (decode) this.onload(); else this.onerror(); }
    },
    document: { createElement: (name: string) => {
      assert.equal(name, "canvas");
      canvas = { width: 0, height: 0,
        getContext: () => context ? { fillRect() {}, drawImage() {} } : null,
        toBlob(callback, type, quality) {
          const size = sizes[Math.min(calls.length, sizes.length - 1)];
          calls.push({ type, quality, width: canvas.width, height: canvas.height });
          callback(size === null ? null : new Blob([new Uint8Array(size)], { type }));
        },
      };
      return canvas;
    } },
  });
  return { compress: () => loaded.exports.compressServicePhoto({ name: "synthetic.jpg" } as File), calls, revoked };
}

test("service photo compression produces bounded JPEG and releases the source URL", async () => {
  const fixture = await compressionFixture({ sizes: [900_000, 360_000, 200_000] });
  const result = await fixture.compress();
  assert.equal(result.type, "image/jpeg");
  assert.ok(result.size <= 350_000);
  assert.equal(fixture.calls.length, 3);
  assert.ok(fixture.calls.every((call) => call.type === "image/jpeg" && call.width <= 1800 && call.height <= 1800));
  assert.deepEqual(fixture.revoked, ["blob:synthetic-photo"]);
});

test("undecodable HEIC is an explicit failure, never an uncompressed fallback", async () => {
  const fixture = await compressionFixture({ decode: false });
  await assert.rejects(fixture.compress(), /HEIC.*Choose a JPEG\/PNG/);
  assert.equal(fixture.calls.length, 0);
  assert.deepEqual(fixture.revoked, ["blob:synthetic-photo"]);
});

test("missing canvas and failed encoding are explicit failures", async () => {
  const unavailable = await compressionFixture({ context: false });
  await assert.rejects(unavailable.compress(), /compression is unavailable/);
  const failed = await compressionFixture({ sizes: [null] });
  await assert.rejects(failed.compress(), /compression failed/);
  assert.equal(unavailable.revoked.length, 1);
  assert.equal(failed.revoked.length, 1);
});

test("oversized or empty encoding fails after bounded attempts", async () => {
  for (const size of [350_001, 0]) {
    const fixture = await compressionFixture({ sizes: [size] });
    await assert.rejects(fixture.compress(), /350 KB/);
    assert.equal(fixture.calls.length, 5);
    assert.equal(fixture.revoked.length, 1);
  }
});

test("legacy photo UI keeps shared inputs mounted and uses append-only writes", () => {
  const source = readFileSync("src/app/tech/job/[jobId]/page.tsx", "utf8");
  const handler = source.slice(source.indexOf("const handlePhotoSelected"), source.indexOf("// Fetch QuickBooks inventory"));
  assert.match(handler, /fetch\("\/api\/tech\/job-photos"/);
  assert.match(handler, /JSON\.stringify\(\{ jobId, photos: newPhotos \}\)/);
  assert.doesNotMatch(handler, /persistJobUpdates|existingPhotos|method: ["']PUT/);
  assert.ok(source.indexOf("ref={fileInputRef}") < source.indexOf('activeTab === "photos"'));
  assert.ok(source.indexOf("ref={galleryInputRef}") < source.indexOf('activeTab === "photos"'));
  assert.match(source, /pendingChecklistPhoto\.current = item/);
  assert.match(handler, /photoSavingRef\.current = true/);
});

test("new reports use domain validation and independent report finalization", () => {
  const source = readFileSync("src/components/service-reports/ServiceReportEditor.tsx", "utf8");
  assert.match(source, /validateReport\(data, selected\.photos\)/);
  assert.doesNotMatch(source, /\/api\/jobs|status: ["']completed/);
  assert.match(source, /action: "finalize"/);
  assert.match(source, /readOnly=\{field.id === "technicianName"\}/);
  const history = readFileSync("src/components/service-reports/ServiceReportHistory.tsx", "utf8");
  assert.match(history, /attempt\.current \|\|/);
  assert.match(history, /Email accepted by the provider\. Inbox delivery is not confirmed/);
  assert.doesNotMatch(history, /Delivery confirmed by|status === "delivered"/);
});

test("confirmation dialogs use an opaque theme surface", () => {
  for (const name of ["ServiceReportEditor", "ServiceReportHistory"]) {
    const source = readFileSync(`src/components/service-reports/${name}.tsx`, "utf8");
    const dialog = source.slice(source.indexOf("<dialog"), source.indexOf("</dialog>"));
    const openingTag = dialog.slice(0, dialog.indexOf('backdrop:bg-black/60"') + 24);
    assert.match(openingTag, /bg-\[var\(--color-bg\)\]/);
    assert.doesNotMatch(openingTag, /bg-\[var\(--color-surface-1\)\]/);
  }
});

test("storage diagnostic is explicitly clicked, role-gated and verifies cleanup", () => {
  const source = readFileSync("src/components/service-reports/ServiceReportEditor.tsx", "utf8");
  assert.match(source, /context\?\.canVerifyStorage &&/);
  assert.match(source, /onClick=\{\(\) => void checkStorage\(\)\}/);
  const action = source.slice(source.indexOf("async function checkStorage()"), source.indexOf("async function save()"));
  assert.match(action, /if \(!context\?\.canVerifyStorage \|\| loading\) return/);
  assert.match(action, /await run\("Checking report file connection/);
  assert.match(action, /JSON\.stringify\(\{ action: "check-storage" \}\)/);
  assert.match(action, /syntheticObjectRemoved !== true/);
  assert.match(action, /Private report storage verified/);
  assert.doesNotMatch(action, /jobId|customerId|applyReport|setData/);
});
