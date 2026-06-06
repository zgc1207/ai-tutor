import http from 'node:http';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const startScript = join(projectRoot, 'scripts', 'start-expo-local.js');
const expoStartLog = join(projectRoot, '.expo', 'dev', 'logs', 'start.log');
const port = process.env.EXPO_CHECK_PORT || '8082';
const timeoutMs = Number(process.env.EXPO_CHECK_TIMEOUT_MS || 30000);
const startedAt = Date.now();
const output = [];

function remember(chunk) {
  const text = chunk.toString();
  output.push(text);
  while (output.join('').length > 12000) output.shift();
}

function probePort(candidatePort) {
  return new Promise(resolve => {
    const request = http.get({ host: '127.0.0.1', port: candidatePort, path: '/', timeout: 1000 }, response => {
      response.resume();
      resolve({
        ok: response.statusCode >= 200 && response.statusCode < 500,
        statusCode: response.statusCode,
      });
    });
    request.on('timeout', () => {
      request.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    request.on('error', error => resolve({ ok: false, error: error.code || error.message }));
  });
}

function readExpoLogEvents() {
  if (!fs.existsSync(expoStartLog)) return [];
  return fs.readFileSync(expoStartLog, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(event => event && event._t >= startedAt - 1000)
    .slice(-20);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function candidatePorts(events) {
  return unique([
    Number(port),
    ...events
      .map(event => Number(event.port))
      .filter(Number.isFinite),
  ]);
}

function diagnose(events) {
  const eventNames = events.map(event => event._e).filter(Boolean);
  const outputText = output.join('');
  if (/Another process is running|already running|address already in use|EADDRINUSE/i.test(outputText)) {
    return 'Expo appears blocked by an existing process or occupied port.';
  }
  if (/Installing|Downloading|DevTools|dependency|doctor/i.test(outputText)) {
    return 'Expo emitted dependency or DevTools activity before Metro became reachable.';
  }
  if (eventNames.includes('metro:instantiate')) {
    const actualPorts = unique(events.map(event => event.port)).join(', ');
    return `Expo reached Metro initialization, but no probed HTTP port was reachable. Metro event ports: ${actualPorts || 'unknown'}.`;
  }
  if (eventNames.includes('devserver:start')) {
    return 'Expo started dev server setup, but did not reach Metro initialization.';
  }
  if (eventNames.includes('env:load')) {
    return 'Expo loaded environment files, then stalled before dev server setup.';
  }
  return 'Expo did not emit enough startup events for a precise diagnosis.';
}

const childArgs = [startScript, '--offline', '--port', port];
const child = spawn(process.execPath, childArgs, {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    CI: '1',
    EXPO_DEBUG: '1',
    FORCE_COLOR: '0',
  },
});

child.stdout.on('data', remember);
child.stderr.on('data', remember);

let finished = false;

async function finish(ok, message) {
  if (finished) return;
  finished = true;

  if (!child.killed) child.kill('SIGTERM');

  const events = readExpoLogEvents();
  const details = {
    ok,
    port: Number(port),
    elapsedMs: Date.now() - startedAt,
    message,
    diagnosis: diagnose(events),
    command: `${process.execPath} ${childArgs.join(' ')}`,
    childPid: child.pid,
    expoStartLog,
    probedPorts: candidatePorts(events),
    expoEvents: events.map(event => ({
      event: event._e,
      port: event.port,
      host: event.host,
      ageMs: Date.now() - event._t,
    })),
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
  const events = readExpoLogEvents();
  for (const candidatePort of candidatePorts(events)) {
    const result = await probePort(candidatePort);
    if (result.ok) {
      clearInterval(interval);
      await finish(true, `Metro is reachable on port ${candidatePort}.`);
      return;
    }
  }

  if (Date.now() - startedAt > timeoutMs) {
    clearInterval(interval);
    await finish(false, 'Timed out waiting for Metro to become reachable.');
  }
}, 1000);
