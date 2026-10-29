import { spawnSync } from 'node:child_process';

const rawArgs = process.argv.slice(2);
const filteredArgs = rawArgs.map((arg) => {
  if (arg.startsWith('server/') || arg.startsWith('server\\')) {
    return arg.replace(/^server[/\\]/, '');
  }
  return arg;
});

const result = spawnSync('npx', ['vitest', 'run', ...filteredArgs], {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd(),
});

process.exit(result.status ?? 0);
