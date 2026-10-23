import 'dotenv/config';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { detectarChrome } from './chrome.js';

const endpoint = new URL(process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222');
if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port) {
  throw new Error('npm run chrome exige CDP_ENDPOINT=http://127.0.0.1:<porta>.');
}
const chrome = spawn(detectarChrome(), [
  `--remote-debugging-port=${endpoint.port}`, '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${path.join(homedir(), '.auto-apply-chrome')}`,
  '--no-first-run', 'about:blank',
], { detached: true, stdio: 'ignore' });
chrome.on('error', () => { console.error('Nao foi possivel iniciar o Chrome. Confira CHROME_PATH.'); process.exitCode = 1; });
chrome.unref();
