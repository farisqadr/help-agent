import { appendFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = resolve(__dirname, '..', 'logs');

async function appendJsonLog(filename, entry) {
  await mkdir(LOGS_DIR, { recursive: true });
  const path = resolve(LOGS_DIR, filename);
  const line = JSON.stringify(entry) + '\n';
  await appendFile(path, line);
}

export async function logScreening(result) {
  await appendJsonLog('screening-log.json', {
    type: 'screening',
    timestamp: result.timestamp ?? new Date().toISOString(),
    candidates: result.candidates?.map((c) => ({
      poolAddress: c.poolAddress,
      score: c.score,
      name: c.name,
    })),
    rejected: result.rejected,
  });
}

export async function logDecision(decision) {
  await appendJsonLog('decision-log.json', {
    type: 'decision',
    timestamp: new Date().toISOString(),
    ...decision,
  });
}
