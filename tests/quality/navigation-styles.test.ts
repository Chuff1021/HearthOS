import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import postcss from "postcss";

const css = postcss.parse(readFileSync("src/app/globals.css", "utf8"));

function declarations(selector: string) {
  const result: Record<string, string> = {};
  css.walkRules((rule) => {
    if (rule.selector === selector) rule.walkDecls((declaration) => { result[declaration.prop] = declaration.value; });
  });
  return result;
}

test("collapsed navigation geometry fits inside the 76px rail without hiding its toggle", () => {
  assert.equal(declarations('.hearth-sidebar[data-collapsed="true"]').width, "76px");
  assert.equal(declarations('.hearth-sidebar[data-collapsed="true"] .hearth-sidebar-header')["flex-direction"], "column");
  assert.equal(declarations('.hearth-sidebar[data-collapsed="true"] .hearth-nav-link').padding, "6px");
  assert.equal(declarations(".hearth-sidebar-navigation")["min-height"], "0");
  assert.equal(declarations(".hearth-sidebar-navigation")["overflow-y"], "auto");
  assert.equal(declarations(".hearth-nav-link")["min-height"], "40px");
});

test("mobile dock reserves content space and drawer can scroll within safe viewport bounds", () => {
  const dock = declarations(".hearth-mobile-dock");
  assert.equal(dock["grid-template-columns"], "repeat(5, minmax(0, 1fr))");
  assert.match(dock.padding, /safe-area-inset-bottom/);
  const shell = declarations(".flex.h-screen.overflow-hidden:has(> .hearth-sidebar)");
  assert.equal(shell.height, "100dvh");
  assert.match(shell["padding-bottom"], /65px.*safe-area-inset-bottom/);
  assert.match(declarations(".hearth-navigation-drawer")["max-height"], /100dvh.*safe-area-inset-top/);
  assert.equal(declarations(".hearth-drawer-navigation")["overflow-y"], "auto");
  assert.equal(declarations(".hearth-drawer-header")["flex-shrink"], "0");
  assert.equal(declarations(".hearth-drawer-navigation .hearth-nav-link")["min-height"], "44px");
});

test("blanket inline-surface blur rules are removed while named outer glass panels remain", () => {
  css.walkRules((rule) => {
    if (rule.selector.includes('[style*="--color-surface')) {
      rule.walkDecls((declaration) => assert.notEqual(declaration.prop, "backdrop-filter", rule.selector));
    }
  });
  let outerGlass = false;
  let nestedGlass = false;
  css.walkRules((rule) => {
    if (rule.selectors.includes(".glass-shell")) rule.walkDecls("backdrop-filter", (decl) => { outerGlass ||= decl.value.includes("blur"); });
    if (rule.selectors.includes(".glass-nested")) rule.walkDecls("backdrop-filter", (decl) => { nestedGlass = decl.value !== "none"; });
  });
  assert.equal(outerGlass, true);
  assert.equal(nestedGlass, false);
});

test("primary actions and navigation have explicit keyboard focus support", () => {
  let supported = false;
  css.walkRules((rule) => {
    if (rule.selector.includes(".hearth-sidebar") && rule.selector.includes(":focus-visible")) {
      supported = rule.selector.includes(".ui-btn-primary");
      assert.ok(rule.nodes.some((node) => node.type === "decl" && node.prop === "outline" && node.value.includes("2px")));
    }
  });
  assert.equal(supported, true);
  assert.equal(declarations(":is(.ui-btn-primary, .btn-ember):disabled").cursor, "not-allowed");
});

test("Leaflet zoom is not suppressed and map glass no longer blurs the actual map", () => {
  assert.notEqual(declarations(".ops-map-canvas .leaflet-control-zoom").display, "none");
  for (const selector of [".ops-map-glass", ".premium-tracking-map .ops-map-glass"]) {
    assert.equal(declarations(selector)["backdrop-filter"], undefined);
    assert.equal(declarations(selector)["-webkit-backdrop-filter"], undefined);
  }
});

test("dark mode supplies semantic surfaces and readable navigation instead of fixed white panels", () => {
  const tokens = declarations(':root[data-theme="dark"]');
  assert.equal(tokens["color-scheme"], "dark");
  for (const token of ["--color-bg", "--color-surface-1", "--color-text-primary", "--color-text-muted", "--color-nav-active", "--color-focus-ring"]) {
    assert.ok(tokens[token], `${token} is supplied in dark mode`);
  }
  for (const selector of [".hearth-mobile-dock", ".hearth-navigation-drawer", ".hearth-account-link", ".hearth-nav-icon-button"]) {
    assert.match(declarations(selector).background, /var\(--color-/);
  }
});
