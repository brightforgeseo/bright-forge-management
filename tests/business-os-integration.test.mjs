import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Business OS is wired as a Ben-only first-class Portal view', async () => {
  const [types, app, sidebar, palette, page] = await Promise.all([
    read('types.ts'),
    read('App.tsx'),
    read('components/Sidebar.tsx'),
    read('components/CommandPalette.tsx'),
    read('components/BusinessOS.tsx'),
  ]);

  assert.match(types, /BUSINESS_OS\s*=\s*['"]BUSINESS_OS['"]/);
  assert.match(app, /loadBusinessOS/);
  assert.match(app, /isBenBusinessOsUser\(currentUser\.id\)/);
  assert.match(app, /canNavigateToView/);
  assert.match(app, /if \(!Object\.values\(ToolView\)\.includes\(view\)\) return false;/);
  assert.match(app, /const navigateToView = useCallback/);
  assert.match(app, /onChangeView=\{navigateToView\}/);
  assert.match(app, /target && canNavigateToView\(target\)/);
  assert.match(app, /if \(requested\) navigateToView\(requested\)/);
  assert.match(app, /if \(isBenBusinessOsUser\(currentUser\.id\)\) loadBusinessOS/);
  const priorityPreload = app.match(/const priorityLoaders = \[[\s\S]*?\];/)?.[0] || '';
  assert.doesNotMatch(priorityPreload, /loadBusinessOS/);
  assert.match(sidebar, /label:\s*['"]Business OS['"]/);
  assert.match(sidebar, /isBenBusinessOsUser\(currentUser\.id\)/);
  assert.match(palette, /\[ToolView\.BUSINESS_OS\]/);
  assert.match(page, />Business OS</);
  assert.match(page, /const BusinessOSContent/);
  assert.match(page, /if \(!isBenBusinessOsUser\(props\.currentUser\.id\)\)/);
  assert.match(page, /has not loaded any operating data/);
  assert.match(page, /loadRequestRef/);
  assert.match(page, /isMountedRef/);
  assert.match(page, /const load = useCallback\(async \(background = false\) => \{\s*if \(!isMountedRef\.current\) return;/);
  assert.match(page, /const queueRefresh = \(\) => \{\s*if \(!active \|\| !isMountedRef\.current\) return;/);
  assert.match(page, /\.subscribe\(status => \{\s*if \(!active \|\| !isMountedRef\.current\) return;/);
  assert.match(page, /Decision Queue/);
  assert.match(page, /Completion Proof Gaps/);
  assert.match(page, /System Connections/);
});
