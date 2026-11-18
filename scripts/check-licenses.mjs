// Fails when a production dependency carries a license that is not OSI approved.
import { execFileSync } from 'node:child_process';

const allowed = [
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'CC0-1.0',
  '0BSD',
  'Unlicense',
  'MPL-2.0',
  'BlueOak-1.0.0',
  'Python-2.0',
  'CC-BY-4.0',
  'OFL-1.1',
  'MIT-0',
  'W3C',
  'Zlib',
  'WTFPL',
].join(';');

const out = execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['license-checker-rseidelsohn', '--production', '--json', '--onlyAllow', allowed, '--excludePrivatePackages'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32' },
);
const count = Object.keys(JSON.parse(out)).length;
console.log(`license check passed for ${count} packages`);
