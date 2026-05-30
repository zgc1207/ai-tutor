import { loadEnvFile } from '../src/lib/config.js';
import { sendReviewReminders } from '../src/lib/reminder-notifications.js';
import { prisma } from '../src/lib/prisma.js';

loadEnvFile();

function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function getArg(name) {
  const index = process.argv.findIndex(arg => arg === name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const reminderTime = getArg('--time') || getArg('-t') || currentTime();
const dryRun = hasFlag('--dry-run');

sendReviewReminders({ reminderTime, dryRun })
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
