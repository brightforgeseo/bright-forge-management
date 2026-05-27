const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dashboardPath = path.join(root, 'components', 'Dashboard.tsx');
const source = fs.readFileSync(dashboardPath, 'utf8');

const checks = [
  {
    name: 'DrilldownPanel accepts an exact-task open handler',
    pass: /DrilldownPanel:[\s\S]*onOpenTask:\s*\(task:\s*TaskWithContext\)\s*=>\s*void/.test(source),
  },
  {
    name: 'DrilldownPanel task rows are buttons, not inert divs',
    pass: /<button[\s\S]*onClick=\{\(\)\s*=>\s*onOpenTask\(task\)\}/.test(source),
  },
  {
    name: 'Dashboard writes exact task deep-link data for TaskBoard',
    pass: /localStorage\.setItem\('openTaskModal',\s*JSON\.stringify\(linkData\)\)/.test(source),
  },
  {
    name: 'Dashboard switches to Tasks view for exact task opening',
    pass: /setCurrentView\(ToolView\.TASKS\)/.test(source),
  },
  {
    name: 'Dashboard dispatches the openTaskModal event after setting the view',
    pass: /window\.dispatchEvent\(new CustomEvent\('openTaskModal',\s*\{\s*detail:\s*linkData\s*\}\)\)/.test(source),
  },
  {
    name: 'DrilldownPanel is wired with onOpenTask from Dashboard',
    pass: /<DrilldownPanel[\s\S]*onOpenTask=\{openExactTask\}/.test(source),
  },
];

const failures = checks.filter(check => !check.pass);
if (failures.length) {
  console.error('Dashboard exact-task click verification failed:');
  for (const failure of failures) console.error(`- ${failure.name}`);
  process.exit(1);
}

console.log(`Dashboard exact-task click verification passed (${checks.length}/${checks.length}).`);
