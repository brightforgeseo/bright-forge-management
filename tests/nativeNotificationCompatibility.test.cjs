const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

function mount(api, authenticated = true) {
  const text = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8');
  const source = ts.createSourceFile('App.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes('onNotificationClick')) effect = node.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(effect, 'real notification effect found');
  const calls = [];
  const context = { window: { electronAPI: api }, isAuthenticated: authenticated, sessionIdentityRef: {current: authenticated ? 'current' : null}, currentUser: { id: 'current' }, applyPushDeepLink: (...args) => calls.push(args) };
  const compiled = ts.transpileModule(`(${effect})()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return { cleanup: vm.runInNewContext(compiled, context), calls };
}

test('browser without Electron bridge mounts', () => assert.equal(mount(undefined).cleanup, undefined));
test('older desktop bridge without notification subscription mounts', () => assert.equal(mount({ showNotification() {} }).cleanup, undefined));
test('non-callable subscription cannot crash startup', () => assert.equal(mount({ onNotificationClick: true }).cleanup, undefined));
test('current bridge retains click routing, account isolation and cleanup', () => {
  let listener; let cleaned = 0;
  const result = mount({ onNotificationClick(fn) { listener = fn; return () => cleaned++; } });
  listener({ userId: 'foreign', linkView: 'TASKS', linkData: { taskId: 'foreign' } });
  assert.equal(result.calls.length, 0);
  listener({ userId: 'current', linkView: 'TASKS', linkData: { taskId: 'own' } });
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0][0], 'TASKS');
  assert.equal(result.calls[0][1].taskId, 'own');
  result.cleanup(); assert.equal(cleaned, 1);
});
test('unauthenticated native clicks cannot navigate', () => {
  let listener;
  const result = mount({ onNotificationClick(fn) { listener = fn; return () => {}; } }, false);
  listener({ userId: 'current', linkView: 'TASKS' });
  assert.equal(result.calls.length, 0);
});
test('legacy bridge without unsubscribe does not return an invalid React cleanup', () => assert.equal(mount({ onNotificationClick() { return true; } }).cleanup, undefined));
