/**
 * Jest runner that supplies `--experimental-vm-modules`.
 *
 * The `esm` project in `jest.config.ts` loads the unified/remark/rehype stack,
 * which is ESM-only. Jest can only import ESM when Node's VM modules API is
 * enabled, and that is a process-level flag rather than something a config can
 * turn on.
 *
 * `NODE_OPTIONS=… jest` in the npm script would be the one-liner, but that
 * syntax is not valid in the Windows shell npm uses, so the script would work
 * for some contributors and not others. Setting it here keeps `npm test` the
 * same command everywhere, and adds no dependency — `cross-env` was the other
 * option and this repo already prefers a `scripts/` runner (see build.js).
 *
 * The flag is safe for the CommonJS project, which runs unchanged under it.
 *
 * Arguments are forwarded, so `npm test -- --watch` and
 * `npm test -- test/util` behave as they would with Jest directly.
 */

import { spawn } from 'node:child_process';
import process from 'node:process';

const FLAG = '--experimental-vm-modules';

// Appended rather than replaced: a contributor may already be setting
// something here, and CI runners sometimes set memory limits this way.
const nodeOptions = [process.env.NODE_OPTIONS, FLAG].filter(Boolean).join(' ');

const child = spawn('jest', process.argv.slice(2), {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
});

child.on('error', (error) => {
  console.error('[test] could not start jest:', error.message);
  process.exit(1);
});

// Signals surface as a null code. Report them as a failure rather than as
// success, which is what `process.exit(code)` alone would do.
child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[test] jest terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
