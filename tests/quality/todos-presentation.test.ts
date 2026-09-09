import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import postcss from "postcss";
import ts from "typescript";

const file = "src/app/todos/page.tsx";
const source = readFileSync(file, "utf8");
const css = postcss.parse(readFileSync("src/app/todos/todos.css", "utf8"));
const base = process.env.DESIGN_RELEASE_BASE || "e425fae991ec8ddd3cbc883039c242009679a4d4";

function contract(text: string) {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const printer = ts.createPrinter({ removeComments: true });
  const print = (node: ts.Node) => printer.printNode(ts.EmitHint.Unspecified, node, ast);
  const result = { handlers: [] as string[], requests: [] as string[], hooks: [] as string[], functions: [] as string[] };
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && /^on[A-Z]/.test(node.name.getText(ast))) result.handlers.push(print(node));
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(ast);
      if (name === "fetch") result.requests.push(print(node));
      if (/^use(?:State|Effect|Memo|Callback|Ref|Reducer|SyncExternalStore)$/.test(name)) result.hooks.push(print(node));
    }
    if (ts.isFunctionDeclaration(node) && /^(loadTodos|handleCreateTodo|handleUpdateStatus|handleDeleteTodo|resetForm|isOverdue|dueBucket)$/.test(node.name?.text || "")) {
      result.functions.push(print(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return result;
}

function declarations(selector: string, mobile = false) {
  const values: Record<string, string> = {};
  css.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    const inMobile = rule.parent?.type === "atrule" && rule.parent.params === "(max-width: 767px)";
    if (inMobile !== mobile) return;
    rule.walkDecls((decl) => { values[decl.prop] = decl.value; });
  });
  return values;
}

test("To-Do preserves every existing handler, request, hook and domain helper without executing the page", () => {
  const before = execFileSync("git", ["show", `${base}:${file}`], { encoding: "utf8" });
  assert.deepEqual(contract(source), contract(before));
  const parsed = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
    fileName: file,
  });
  assert.deepEqual(parsed.diagnostics, []);
});

test("To-Do presentation remains screen-only and cannot style other pages or the shared shell", () => {
  assert.match(source, /import "\.\/todos\.css"/);
  assert.doesNotMatch(source, /<svg|linear-gradient|workflow-fixtures|design-preview/);
  css.walkRules((rule) => {
    assert.match(rule.selector, /\.pw-todos\b|\.pw-todo-dialog\b/);
    assert.doesNotMatch(rule.selector, /\.hearth-|\.ops-|\.pw-schedule|\.pw-workspace\s*\{/);
    let parent = rule.parent;
    let screenOnly = false;
    while (parent) {
      if (parent.type === "atrule" && parent.name === "media" && parent.params === "screen") screenOnly = true;
      parent = parent.parent;
    }
    assert.ok(screenOnly, rule.selector);
  });
});

test("To-Do headings and row controls have explicit compact dimensions independent of global utilities", () => {
  assert.equal(declarations(".pw-todos .pw-heading .pw-todos-title")["font-size"], "25px");
  assert.equal(declarations(".pw-todos .pw-todos-group-heading h2")["font-size"], "14px");
  assert.equal(declarations(".pw-todos .pw-task-row .pw-todos-task-title")["font-size"], "14px");
  assert.equal(declarations(".pw-todos .pw-task-row .pw-todos-description")["font-size"], "13px");
  assert.equal(declarations(".pw-todos .pw-todos-meta")["font-size"], "12px");
  assert.equal(declarations(".pw-todos .pw-todos-badge")["font-size"], "12px");
  assert.equal(declarations(".pw-todos .pw-todos-status")["font-size"], "14px");
  assert.equal(declarations(".pw-todos .pw-todos-search-input")["height"], "40px");
  assert.equal(declarations(".pw-todo-dialog .pw-todo-dialog-control")["font-size"], "14px");
  assert.equal(declarations(".pw-todo-dialog .pw-todo-dialog-control")["min-height"], "40px");
  assert.equal(declarations(".pw-todos .pw-todos-primary").background, "#b4420a");
  assert.equal(declarations(".pw-todos.pw-workspace .pw-task-row > .pw-todos-check", true)["min-height"], "40px");
  assert.match(source, /aria-pressed=\{on\}/);
  assert.match(source, /aria-label="Search tasks"/);
  assert.match(source, /aria-label=\{`Edit \$\{todo.title\}`\}/);
  assert.match(source, /aria-label=\{`Delete \$\{todo.title\}`\}/);
});

test("the independently scoped create dialog keeps its header and footer outside the scrolling body", () => {
  assert.match(source, /className="pw-todo-dialog pw-todo-dialog-backdrop/);
  assert.match(source, /className="pw-todo-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="pw-todo-dialog-title"/);
  assert.match(source, /aria-label="Close new task"/);
  const panel = declarations(".pw-todo-dialog .pw-todo-dialog-panel");
  assert.equal(panel["max-height"], "90dvh");
  assert.equal(panel["grid-template-rows"], "auto minmax(0, 1fr) auto");
  assert.equal(panel.overflow, "hidden");
  const body = declarations(".pw-todo-dialog .pw-todo-dialog-body");
  assert.equal(body["min-height"], "0");
  assert.equal(body["overflow-y"], "auto");
  assert.equal(body["overscroll-behavior"], "contain");
  for (const field of ["type", "title", "description", "priority", "due-date", "customer", "phone", "assignee", "tags"]) {
    assert.ok(source.includes(`htmlFor="pw-todo-${field}"`), field);
    assert.ok(source.includes(`id="pw-todo-${field}"`), field);
  }
  assert.equal(declarations(".pw-todo-dialog .pw-todo-dialog-control", true)["font-size"], "16px");
  assert.equal(declarations(".pw-todo-dialog .pw-todo-dialog-fields", true)["grid-template-columns"], "minmax(0, 1fr)");
  const dark = declarations(':root[data-theme="dark"] :is(.pw-todos, .pw-todo-dialog)');
  assert.equal(dark["color-scheme"], "dark");
  for (const token of ["text", "muted", "surface", "line", "danger", "warning", "info", "success"]) {
    assert.ok(dark[`--pw-todos-${token}`], token);
  }
});
