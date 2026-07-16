import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

test('desktop release CI uses a supported Node runtime and ESM-safe rcedit loading', () => {
  const afterPack = readFileSync(resolve(root, 'scripts/afterpack.cjs'), 'utf8');
  const workflow = readFileSync(resolve(root, '.github/workflows/auto-release.yml'), 'utf8');
  const typecheckWorkflow = readFileSync(resolve(root, '.github/workflows/typecheck.yml'), 'utf8');

  assert.match(afterPack, /await import\(['"]rcedit['"]\)/);
  assert.doesNotMatch(afterPack, /require\(['"]rcedit['"]\)/);
  assert.match(workflow, /desktop:\s+[\s\S]*?node-version: 22/);
  assert.match(typecheckWorkflow, /node-version: 22/);
  assert.match(typecheckWorkflow, /run: npm test/);
  const desktopSection = workflow.split('build-desktop:')[1]?.split('build-android:')[0] || '';
  assert.match(desktopSection, /node-version:\s*22/);
});
