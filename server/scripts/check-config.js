import { getConfigStatus, loadEnvFile } from '../src/lib/config.js';

loadEnvFile();
const status = getConfigStatus();
console.log(JSON.stringify(status, null, 2));

if (!status.ok) {
  process.exitCode = 1;
}
