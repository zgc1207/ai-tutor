import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const startScript = join(projectRoot, 'scripts', 'start-expo-local.js');
const port = process.env.EXPO_CHECK_PORT || '8082';
const timeoutMs = Number(process.env.EXPO_CHECK_TIMEOUT_MS || 30000);
const startedAt = Date.now();
const output = [];

function remember(chunk) {
  const text = chunk.toString();
  output.push(text);
  if (output.join('').length > 8000) output.splice(0, output.length - 20);
}

function probe() {
  return new Promise(resolve => {
    const request = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1000 }, response => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

const child = spawn(process.execPath, [startScript, '--offline', '--port', port], {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stdout.on('data', remember);
child.stderr.on('data', remember);

let finished = false;

async function finish(ok, message) {
  if (finished) return;
  finished = true;

  if (!child.killed) child.kill('SIGTERM');

  const details = {
    ok,
    port: Number(port),
    elapsedMs: Date.now() - startedAt,
    message,
    outputTail: output.join('').split('\n').slice(-20).join('\n'),
  };

  console.log(JSON.stringify(details, null, 2));
  process.exit(ok ? 0 : 1);
}

child.on('exit', code => {
  if (!finished && code !== 0) {
    finish(false, `Expo exited before Metro became reachable, code ${code}.`);
  }
});

const interval = setInterval(async () => {
  if (await probe()) {
    clearInterval(interval);
    await finish(true, 'Metro is reachable.');
    return;
  }

  if (Date.now() - startedAt > timeoutMs) {
    clearInterval(interval);
    await finish(false, 'Timed out waiting for Metro to become reachable.');
  }
}, 1000);
