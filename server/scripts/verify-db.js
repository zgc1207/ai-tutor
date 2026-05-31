import { spawnSync } from 'node:child_process';

const SERVER_DIR = process.cwd();

function run(label, command, args) {
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, {
    cwd: SERVER_DIR,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(result.status || 1);
  }

  if (result.status !== 0) {
    process.exit(result.status);
  }
}

run('npm run db:setup', 'npm', ['run', 'db:setup']);
run('npm run db:check', 'npm', ['run', 'db:check']);
run('npm run retention:cleanup', 'npm', ['run', 'retention:cleanup']);
run('npm run reminders:run -- --time 19:30 --dry-run', 'npm', [
  'run',
  'reminders:run',
  '--',
  '--time',
  '19:30',
  '--dry-run',
]);
run('npm run smoke:api', 'npm', ['run', 'smoke:api']);

console.log('\nDatabase and API verification passed.');
