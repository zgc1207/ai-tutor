import fs from 'node:fs/promises';
import path from 'node:path';
import { getUploadRetentionDays, loadEnvFile } from '../src/lib/config.js';
import { IMAGE_DIR } from '../src/lib/local-uploads.js';

loadEnvFile();

const retentionDays = getUploadRetentionDays();
const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

async function cleanupUploads() {
  let entries;
  try {
    entries = await fs.readdir(IMAGE_DIR, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(JSON.stringify({
        uploadDir: IMAGE_DIR,
        retentionDays,
        scanned: 0,
        deleted: 0,
        kept: 0,
        missing: true,
      }, null, 2));
      return;
    }
    throw error;
  }

  let scanned = 0;
  let deleted = 0;
  let kept = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    scanned += 1;
    const filepath = path.join(IMAGE_DIR, entry.name);
    const stat = await fs.stat(filepath);
    if (stat.mtimeMs < cutoffMs) {
      await fs.unlink(filepath);
      deleted += 1;
    } else {
      kept += 1;
    }
  }

  console.log(JSON.stringify({
    uploadDir: IMAGE_DIR,
    retentionDays,
    scanned,
    deleted,
    kept,
    cutoffAt: new Date(cutoffMs).toISOString(),
  }, null, 2));
}

cleanupUploads().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
