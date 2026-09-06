import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('task comment avatar tolerates missing legacy author without changing named authors', () => {
  const source = fs.readFileSync('components/TaskBoard.tsx','utf8');
  const expression = source.match(/\{([^{}]*comment\.author[^{}]*charAt[^{}]*)\}/)?.[1];
  assert.ok(expression, 'Expected the real task-comment avatar expression');
  for (const [author, initial] of [[undefined,'?'],[null,'?'],['','?'],['Ben','B']]) {
    assert.equal(vm.runInNewContext(expression!, {comment:{author}}), initial);
  }
});
