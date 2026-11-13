import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, '.env');

if (existsSync(target)) {
  console.log('.env already exists, leaving it unchanged.');
  process.exit(0);
}

const secret = randomBytes(32).toString('hex');
const example = readFileSync(join(root, '.env.example'), 'utf8');
const env = /^#?\s*S3_SECRET_KEY=.*$/m.test(example)
  ? example.replace(/^#?\s*S3_SECRET_KEY=.*$/m, `S3_SECRET_KEY=${secret}`)
  : `${example.trimEnd()}\nS3_SECRET_KEY=${secret}\n`;

writeFileSync(target, env);
console.log('Created .env with a random S3_SECRET_KEY.');
