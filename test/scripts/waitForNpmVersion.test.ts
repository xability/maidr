import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';

/**
 * The release workflow tells r-maidr, py-maidr and maidr-skill about a release
 * only once the registry serves it.
 *
 * It used to ping them the moment `npm publish` returned. npm now serves a
 * release minutes after that: 4.9.0 about ten minutes later, 4.11.0 eighteen
 * (15:19:22 to 15:37:44 UTC on 2026-09-28). r-maidr and py-maidr each retried
 * the 4.11.0 ping for fifteen minutes and gave up at 15:34, so a release the
 * pipeline reported as delivered reached neither of them.
 *
 * `scripts/ci/waitForNpmVersion.cjs` is the wait. The registry and the clock
 * are stubbed, so the hour it can take passes at once. The last block checks
 * the other half: that the notify step still runs the wait, and runs it
 * before the first ping, since every case above passes against a workflow
 * that no longer calls the module at all.
 *
 * `require` rather than `import` for the reason `e2eReportWorkflow.test.ts`
 * gives: the module is `.cjs` and this file runs in Jest's CommonJS project.
 */

interface RegistryAnswer {
  ok: boolean;
  status: number;
}

interface WaitOptions {
  name: string;
  version: string;
  attempts?: number;
  intervalMs?: number;
  timeoutMs?: number;
  // `init` optional here, though the module always passes it, so that a
  // module which stopped passing it reaches the stub rather than a TypeError.
  fetch?: (url: string, init?: { signal?: AbortSignal }) => Promise<RegistryAnswer>;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

const ROOT = resolve(__dirname, '../..');
const MODULE = join(ROOT, 'scripts/ci/waitForNpmVersion.cjs');

// eslint-disable-next-line ts/no-require-imports -- CommonJS module; see the docblock.
const { waitForNpmVersion } = require(MODULE) as {
  waitForNpmVersion: (options: WaitOptions) => Promise<number>;
};

/**
 * A registry that does not serve the version for its first `misses` checks.
 * `miss` is what it does instead: answer with a status, fail the request, or
 * `'hang'` -- never answer, so only the check's own abort signal ends it.
 */
function registry(misses: number, miss: number | Error | 'hang' = 404): {
  stubs: Pick<WaitOptions, 'fetch' | 'sleep' | 'log'>;
  urls: string[];
  sleeps: number[];
  logs: string[];
} {
  const urls: string[] = [];
  const sleeps: number[] = [];
  const logs: string[] = [];
  return {
    urls,
    sleeps,
    logs,
    stubs: {
      fetch: async (url, init) => {
        urls.push(url);
        if (urls.length > misses)
          return { ok: true, status: 200 };
        if (miss === 'hang') {
          // Settles only through the signal, as a hung request would.
          const signal = init?.signal;
          return new Promise((_, reject) => {
            signal?.addEventListener('abort', () => reject(signal.reason));
          });
        }
        if (miss instanceof Error)
          throw miss;
        return { ok: false, status: miss };
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      log: (message) => {
        logs.push(message);
      },
    },
  };
}

describe('waitForNpmVersion', () => {
  it('should return on the first check when the registry already serves the version', async () => {
    const r = registry(0);

    await expect(waitForNpmVersion({ name: 'maidr', version: '4.11.0', ...r.stubs })).resolves.toBe(1);
    expect(r.urls).toEqual(['https://registry.npmjs.org/maidr/4.11.0']);
    expect(r.sleeps).toEqual([]);
  });

  it('should wait out the eighteen minutes 4.11.0 took, checking every 30 s', async () => {
    const r = registry(36);

    await expect(waitForNpmVersion({ name: 'maidr', version: '4.11.0', ...r.stubs })).resolves.toBe(37);
    expect(r.sleeps).toEqual(Array.from({ length: 36 }, () => 30_000));
    expect(r.logs[0]).toBe('maidr@4.11.0 is not on the registry yet (check 1 of 120: answered 404).');
  });

  it('should give up after an hour, without a pause after the last check', async () => {
    const r = registry(Infinity);

    await expect(waitForNpmVersion({ name: 'maidr', version: '4.11.0', ...r.stubs })).resolves.toBe(0);
    expect(r.urls).toHaveLength(120);
    expect(r.sleeps).toHaveLength(119);
  });

  it('should treat a 5xx from a replica that has not caught up as not yet', async () => {
    const r = registry(2, 503);

    await expect(waitForNpmVersion({ name: 'maidr', version: '4.11.0', ...r.stubs })).resolves.toBe(3);
    expect(r.logs).toHaveLength(2);
  });

  it('should treat a request that fails outright as not yet rather than throw', async () => {
    const r = registry(1, new Error('getaddrinfo EAI_AGAIN registry.npmjs.org'));

    await expect(waitForNpmVersion({ name: 'maidr', version: '4.11.0', ...r.stubs })).resolves.toBe(2);
    expect(r.logs[0]).toContain('failed: getaddrinfo EAI_AGAIN');
  });

  // The hour is only an hour if each check ends on its own. Without the
  // signal this registry never answers, the first check never returns, and
  // the case times out instead of passing.
  it('should give up on a check the registry never answers', async () => {
    const r = registry(Infinity, 'hang');

    await expect(waitForNpmVersion({ name: 'maidr', version: '4.11.0', attempts: 2, timeoutMs: 20, ...r.stubs })).resolves.toBe(0);
    expect(r.urls).toHaveLength(2);
    expect(r.logs[0]).toContain('failed: ');
  });

  it('should honour a shorter budget', async () => {
    const r = registry(Infinity);

    await expect(waitForNpmVersion({ name: 'maidr', version: '4.11.0', attempts: 3, intervalMs: 5, ...r.stubs })).resolves.toBe(0);
    expect(r.urls).toHaveLength(3);
    expect(r.sleeps).toEqual([5, 5]);
  });
});

/**
 * The seam the module opens, as in `e2eReportWorkflow.test.ts`: the cases
 * above pass whether or not the workflow still calls the module. This reads
 * the raw YAML and asks only that a command line, not a comment, runs the
 * wait, and that it comes before the line that sends the pings.
 */
describe('the release workflow', () => {
  const lines = readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf8')
    .split('\n')
    .map(line => line.trim());
  // eslint-disable-next-line no-template-curly-in-string -- literal shell text, not a template.
  const wait = lines.findIndex(line => line.startsWith('node scripts/ci/waitForNpmVersion.cjs maidr "${VERSION}"'));
  const ping = lines.findIndex(line => !line.startsWith('#') && line.includes('gh api "repos/$repo/dispatches"'));

  it('should run the wait for the version it just published', () => {
    expect(wait).toBeGreaterThan(-1);
  });

  it('should wait before it pings anyone', () => {
    expect(ping).toBeGreaterThan(wait);
  });
});
