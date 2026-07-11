#!/usr/bin/env node
/**
 * HT-311 alias — delegates to scripts/sla-eval.js
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [path.join(__dirname, 'sla-eval.js'), ...process.argv.slice(2)], {
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
