import { loadEnvFile } from '../src/lib/config.js';
import { evaluateOpsHealth } from '../src/lib/ops-health.js';
import { prisma } from '../src/lib/prisma.js';

loadEnvFile();

function getArg(name) {
  const index = process.argv.findIndex(arg => arg === name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const days = Number(getArg('--days') || getArg('-d') || 7);

evaluateOpsHealth({ days })
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
