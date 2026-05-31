import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const localHome = join(projectRoot, '.expo-home');

mkdirSync(localHome, { recursive: true });

const expoBin = join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'expo.cmd' : 'expo');
const extraArgs = process.argv.slice(2);
const useOfflineEnv = extraArgs.includes('--offline');
const forwardedArgs = extraArgs.filter(arg => arg !== '--offline');
const hostArgs = forwardedArgs.some(arg => arg === '--host' || arg === '--lan' || arg === '--localhost' || arg === '--tunnel')
  ? []
  : ['--localhost'];
const child = spawn(expoBin, ['start', ...hostArgs, ...forwardedArgs], {
  cwd: projectRoot,
  env: {
    ...process.env,
    HOME: localHome,
    EXPO_NO_TELEMETRY: '1',
    ...(useOfflineEnv ? {
      EXPO_NO_DEPENDENCY_VALIDATION: '1',
      EXPO_UNSTABLE_HEADLESS: '1',
    } : {}),
  },
  stdio: 'inherit'
});

function forwardSignal(signal) {
  if (!child.killed) child.kill(signal);
  setTimeout(() => process.exit(1), 3000).unref();
}

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
