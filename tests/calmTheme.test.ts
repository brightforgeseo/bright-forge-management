import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('light palette preserves search hints and dark logo-overlay text', () => {
  const css = fs.readFileSync('team-calm.css', 'utf8');
  assert.ok(css.includes('.placeholder-white\\/30::placeholder'));
  assert.ok(css.includes('.bg-black\\/40.text-white'));
});

test('calm theme retains dark chat members and reminder-header ink', () => {
  const css = fs.readFileSync('team-calm.css', 'utf8');
  assert.ok(css.includes('[class~="bg-[#1a1d29]"]'));
  assert.ok(css.includes('[class~="bg-[#2d3142]"]'));
  assert.ok(css.includes('.from-violet-500'));
});

test('theme embeds Inter locally and keeps legacy palette fallbacks', () => {
  const css = fs.readFileSync('team-calm.css', 'utf8');
  assert.match(css, /@font-face/);
  assert.match(css, /Portal Inter/);
  assert.match(css, /--portal-dark:\s*#f6f7f9/);
  assert.match(css, /\.portal-calm \.portal-sidebar/);
  assert.ok(fs.statSync('assets/fonts/Inter.ttf').size > 10000);
  const config = fs.readFileSync('tailwind.config.js', 'utf8');
  assert.match(config, /var\(--portal-dark-rgb, 13 15 26\)/);
  assert.match(config, /<alpha-value>/);
});

// Theme activation is deliberately confined to the authenticated team shell.
test('calm theme is team scoped with a separate dark sidebar', () => {
  const app = fs.readFileSync('App.tsx', 'utf8');
  const sidebar = fs.readFileSync('components/Sidebar.tsx', 'utf8');
  assert.match(app, /className="portal-calm flex h-screen/);
  assert.match(sidebar, /portal-sidebar/);
  assert.doesNotMatch(fs.readFileSync('ClientPortalApp.tsx', 'utf8'), /portal-calm/);
});
