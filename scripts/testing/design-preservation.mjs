import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const base = process.env.DESIGN_RELEASE_BASE || '7cfbe34f1a4e6dd21358d35ce9384a1bea04dee4';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const changed = git('diff', '--name-only', base).split('\n').filter(Boolean);
const added = [...new Set([
  ...git('diff', '--name-only', '--diff-filter=A', base).split('\n'),
  ...git('ls-files', '--others', '--exclude-standard').split('\n'),
].filter(Boolean))];
const protectedPath = /^(src\/(app\/api|lib|db)\/|src\/(proxy|middleware)\.|src\/components\/(layout\/BusinessAccessGate|layout\/header-identity|layout\/header-search|tech\/(TechAuthGate|TechPwaProvider|TechRuntimeProvider|GpsStatusContext))\.|public\/|package(?:-lock)?\.json$|vercel\.json$|next\.config\.)/;
assert.deepEqual([...changed, ...added].filter(file => protectedPath.test(file)), [], 'Data, auth, providers, runtime config and public assets must remain untouched');
assert.deepEqual(added.filter(file => /src\/app\/.*(?:page|route)\.tsx?$/.test(file)), [], 'No new production routes');
assert.equal(git('diff', '--name-only', '--diff-filter=D', base, '--', 'src/app'), '', 'No deleted routes');

function contracts(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const printer = ts.createPrinter({ removeComments: true });
  const print = node => printer.printNode(ts.EmitHint.Unspecified, node, source);
  const result = { handlers: [], requests: [], hooks: [] };
  const visit = node => {
    if (ts.isJsxAttribute(node) && /^on[A-Z]/.test(node.name.getText(source))) {
      result.handlers.push(print(node));
    }
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(source);
      if (name === 'fetch' || name.endsWith('.fetch')) result.requests.push(print(node));
      if (/^(?:React\.)?use(?:State|Reducer|Effect|Memo|Callback|Ref|SyncExternalStore)$/.test(name)) {
        result.hooks.push(print(node));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

let components = 0;
for (const file of changed.filter(file => file.startsWith('src/') && file.endsWith('.tsx') && !added.includes(file))) {
  const before = contracts(git('show', `${base}:${file}`), file);
  const current = readFileSync(file, 'utf8');
  const after = contracts(current, file);
  for (const key of ['handlers', 'requests', 'hooks']) {
    assert.deepEqual(after[key], before[key], `${file}: existing ${key} must remain identical`);
  }
  assert.doesNotMatch(current, /design-preview\.v[13]|Ember & Stone|Casey Reed|operations-fixtures|billing-fixtures|workflow-fixtures/, `${file}: no prototype fixtures`);
  components++;
}
console.log(JSON.stringify({ pass: true, base, components, eventHandlersUnchanged: true, fetchCallsUnchanged: true, stateAndEffectHooksUnchanged: true, protectedBackendUnchanged: true, noNewRoutes: true }));
