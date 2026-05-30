import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const localHome = join(projectRoot, '.expo-home');

mkdirSync(localHome, { recursive: true });

const expoBin = join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'expo.cmd' : 'expo');
const child = spawn(expoBin, ['start', '--localhost'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    HOME: localHome,
    EXPO_NO_TELEMETRY: '1'
  },
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
