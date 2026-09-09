import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildScheduleTechColors, technicianStyle, UNASSIGNED_TECH_COLOR } from "../../src/components/scheduling/technician-colors";

const roster = Array.from({ length: 7 }, (_, index) => Object.freeze({ id: `tech-${index}`, color: "#2563EB" }));

test("seven technicians with the same persisted default get seven display colors without mutation", () => {
  const colors = buildScheduleTechColors(Object.freeze(roster));
  assert.equal(colors.size, 7);
  assert.equal(new Set(colors.values()).size, 7);
  assert.deepEqual(roster.map(tech => tech.color), Array(7).fill("#2563EB"));
  assert.deepEqual(colors, buildScheduleTechColors([...roster].reverse()));
  assert.deepEqual(colors, buildScheduleTechColors(roster));
});

test("configured unique colors are reserved and normalized before duplicate allocation", () => {
  const colors = buildScheduleTechColors([...roster, { id: "custom-teal", color: "#0F766E" }, { id: "custom-short", color: "#AbC" }]);
  assert.equal(colors.get("custom-teal"), "#0f766e");
  assert.equal(colors.get("custom-short"), "#aabbcc");
  assert.equal(new Set(colors.values()).size, 9);
});

test("directory identity wins over stale historical assignment colors", () => {
  const before = buildScheduleTechColors(roster);
  const after = buildScheduleTechColors(roster, [...roster.map(tech => ({ ...tech, color: "#FF0000" })), { id: "past-tech", color: "#2563EB" }]);
  for (const [id, color] of before) assert.equal(after.get(id), color);
  assert.equal(new Set(after.values()).size, 8);
  assert.deepEqual(after, buildScheduleTechColors([...roster].reverse(), [{ id: "past-tech", color: "#2563EB" }, ...roster]));
});

test("missing and malformed colors fail to a palette, including beyond the small palette size", () => {
  const records = Array.from({ length: 40 }, (_, index) => ({ id: `unknown-${index}`, color: index % 2 ? "" : "url(https://example.invalid)" }));
  const colors = buildScheduleTechColors(records);
  assert.equal(colors.size, 40);
  assert.equal(new Set(colors.values()).size, 40);
  for (const color of colors.values()) assert.match(color, /^(#[0-9a-f]{6}|hsl\([\d.]+ 58% 43%\))$/);
  assert.deepEqual(buildScheduleTechColors([]), new Map());
  assert.deepEqual(technicianStyle(UNASSIGNED_TECH_COLOR), { "--schedule-tech-color": "#64748b" });
});

test("schedule presentation does not serialize derived colors into new job assignments", () => {
  const source = readFileSync("src/app/schedule/page.tsx", "utf8");
  assert.match(source, /\.map\(\(t\) => \(\{ id: t.id, name: t.name, color: t.color \}\)\)/);
  assert.match(source, /buildScheduleTechColors\(techs, jobs.flatMap/);
  assert.match(source, /borderLeft: `4px solid \$\{techColor\}`/);
  assert.match(source, /Urgent priority/);
});
