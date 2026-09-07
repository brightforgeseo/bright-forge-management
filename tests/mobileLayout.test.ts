import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('mobile shell reserves safe areas and gives every non-chat screen header space',()=>{
 const app=read('App.tsx');
 assert.match(app,/portal-mobile-main/);
 assert.match(app,/currentView === ToolView.TEAM_CHAT \? '' : 'portal-with-header'/);
 const css=read('mobile-workspace.css');
 assert.match(css,/100dvh/);
 assert.match(css,/env\(safe-area-inset-bottom/);
});
test('task editor has an accessible labelled dialog and mobile layout hook',()=>{
 const source=read('components/TaskBoard.tsx');
 assert.match(source,/role="dialog" aria-modal="true" aria-label="Task details"/);
 assert.match(source,/portal-task-dialog/);
 assert.match(source,/aria-label="Close task details"/);
});
