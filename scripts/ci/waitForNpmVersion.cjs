'use strict';

/**
 * Waits until the npm registry serves one version of a package.
 *
 * The release workflow runs this between publishing to npm and telling
 * r-maidr, py-maidr and maidr-skill about the release, because the first no
 * longer implies the second: npm now serves a release minutes after
 * `npm publish` returns. 4.9.0 appeared about ten minutes after the publish
 * step ended and 4.11.0 eighteen (15:19:22 to 15:37:44 UTC), and on 4.11.0
 * r-maidr and py-maidr, each of which retries for fifteen minutes after the
 * ping, gave up before it appeared, because the ping went out the moment the
 * publish step ended.
 *
 * A module rather than a loop in the workflow's YAML so that a test can reach
 * it, which is what #694 moved `e2eReport.cjs` out for; `.cjs` for the reasons
 * given there. `test/scripts/waitForNpmVersion.test.ts` exercises it and checks
 * that the workflow still runs it ahead of the pings.
 *
 * Usage: node scripts/ci/waitForNpmVersion.cjs <package> <version>
 * Exits 0 once the registry serves the version, 1 if it never does.
 */

const process = require('node:process');

/**
 * What this file reads from a registry response, rather than all of `Response`.
 * @typedef {{ ok: boolean, status: number }} RegistryAnswer
 */

/**
 * @typedef {object} WaitOptions
 * @property {string} name The package, as the registry names it.
 * @property {string} version The exact version to wait for.
 * @property {number} [attempts] Checks before giving up; 120 by default.
 * @property {number} [intervalMs] Pause between checks; 30 s by default, so
 *   an hour in all, over three times the longest lag seen.
 * @property {number} [timeoutMs] How long one check may take; 10 s by
 *   default. Without it a request that hangs holds its check open for as long
 *   as `fetch` allows (five minutes in Node), and the hour stops being one.
 * @property {(url: string, init: { signal: AbortSignal }) => Promise<RegistryAnswer>} [fetch]
 *   The global `fetch` unless a test stands in for the registry.
 * @property {(ms: number) => Promise<void>} [sleep] Stubbed by the tests so
 *   the hour passes at once.
 * @property {(message: string) => void} [log] Where each miss is reported.
 */

/**
 * Checks `registry.npmjs.org/<name>/<version>` until it answers 2xx.
 *
 * Any other answer, a request that fails outright, and one that outlasts
 * `timeoutMs` count as "not yet" rather than as an error: in the window after
 * a publish the registry has also answered with a 5xx from a replica that had
 * not caught up (see the wait in r-maidr's `.github/scripts/fetch-maidr-bundle.sh`).
 *
 * @param {WaitOptions} options
 * @returns {Promise<number>} The check on which the version was first served,
 *   or 0 if it never was.
 */
async function waitForNpmVersion({
  name,
  version,
  attempts = 120,
  intervalMs = 30_000,
  timeoutMs = 10_000,
  fetch = globalThis.fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  log = message => console.log(message),
}) {
  const url = `https://registry.npmjs.org/${name}/${version}`;
  for (let check = 1; check <= attempts; check++) {
    let answer;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok)
        return check;
      answer = `answered ${response.status}`;
    } catch (error) {
      answer = `failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    log(`${name}@${version} is not on the registry yet (check ${check} of ${attempts}: ${answer}).`);
    if (check < attempts)
      await sleep(intervalMs);
  }
  return 0;
}

module.exports = { waitForNpmVersion };

if (require.main === module) {
  const [name, version] = process.argv.slice(2);
  if (!name || !version) {
    console.error('Usage: node scripts/ci/waitForNpmVersion.cjs <package> <version>');
    process.exit(2);
  }
  waitForNpmVersion({ name, version }).then((check) => {
    if (check) {
      console.log(`${name}@${version} is on the registry (check ${check}).`);
      return;
    }
    console.log(`${name}@${version} is still not on the registry; giving up.`);
    process.exitCode = 1;
  });
}
