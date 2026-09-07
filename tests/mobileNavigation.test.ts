import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (name: string) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
test('mobile navigation exposes the full menu from every view including chat', () => {
 const tabs = read('components/MobileTabBar.tsx');
 assert.match(tabs, /onOpenMenu/);
 assert.match(tabs, /aria-label="Open all tools"/);
 assert.match(read('App.tsx'), /onOpenMenu=\{\(\) => setIsMobileMenuOpen\(true\)\}/);
});
test('desktop collapse preference cannot collapse the phone menu', () => {
 const sidebar = read('components/Sidebar.tsx');
 assert.match(sidebar, /const isCollapsed = isDesktop && desktopCollapsed/);
 assert.match(sidebar, /matchMedia\('\(min-width: 1024px\)'\)/);
});
