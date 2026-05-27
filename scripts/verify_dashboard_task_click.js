const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dashboardPath = path.join(root, 'components', 'Dashboard.tsx');
const taskBoardPath = path.join(root, 'components', 'TaskBoard.tsx');
const dashboard = fs.readFileSync(dashboardPath, 'utf8');
const taskBoard = fs.readFileSync(taskBoardPath, 'utf8');

const checks = [
  {
    name: 'DrilldownPanel accepts an exact-task open handler',
    pass: /DrilldownPanel:[\s\S]*onOpenTask:\s*\(task:\s*TaskWithContext\)\s*=>\s*void/.test(dashboard),
  },
  {
    name: 'DrilldownPanel task rows are buttons, not inert divs',
    pass: /<button[\s\S]*onClick=\{\(\)\s*=>\s*onOpenTask\(task\)\}/.test(dashboard),
  },
  {
    name: 'Dashboard writes exact task deep-link data for TaskBoard',
    pass: /localStorage\.setItem\('openTaskModal',\s*JSON\.stringify\(linkData\)\)/.test(dashboard),
  },
  {
    name: 'Dashboard switches to Tasks view for exact task opening',
    pass: /setCurrentView\(ToolView\.TASKS\)/.test(dashboard),
  },
  {
    name: 'Dashboard dispatches the openTaskModal event after setting the view',
    pass: /window\.dispatchEvent\(new CustomEvent\('openTaskModal',\s*\{\s*detail:\s*linkData\s*\}\)\)/.test(dashboard),
  },
  {
    name: 'DrilldownPanel is wired with onOpenTask from Dashboard',
    pass: /<DrilldownPanel[\s\S]*onOpenTask=\{openExactTask\}/.test(dashboard),
  },
  {
    name: 'TaskBoard keeps task row refs for exact landing',
    pass: /taskRowRefs\s*=\s*useRef/.test(taskBoard) && /taskRowRefs\.current\[task\.id\]\s*=\s*el/.test(taskBoard),
  },
  {
    name: 'TaskBoard marks rows with task IDs for deep-link QA',
    pass: /data-task-id=\{task\.id\}/.test(taskBoard),
  },
  {
    name: 'TaskBoard expands the target group before opening the task',
    pass: /isCollapsed:\s*g\.id\s*===\s*targetGroupId\s*\?\s*false\s*:\s*g\.isCollapsed/.test(taskBoard),
  },
  {
    name: 'TaskBoard scrolls the exact task row into view',
    pass: /scrollIntoView\(\{\s*behavior:\s*'smooth',\s*block:\s*'center'/.test(taskBoard),
  },
  {
    name: 'TaskBoard highlights the exact task row after deep-linking',
    pass: /highlightedTaskId/.test(taskBoard) && /ring-2 ring-brand-500/.test(taskBoard),
  },
  {
    name: 'TaskBoard still opens the exact task modal',
    pass: /setTaskModal\(\{[\s\S]*task,[\s\S]*groupId:\s*group!\.id,[\s\S]*clientId:\s*board\.id/.test(taskBoard),
  },
];

const failures = checks.filter(check => !check.pass);
if (failures.length) {
  console.error('Dashboard exact-task click verification failed:');
  for (const failure of failures) console.error(`- ${failure.name}`);
  process.exit(1);
}

console.log(`Dashboard exact-task click verification passed (${checks.length}/${checks.length}).`);
