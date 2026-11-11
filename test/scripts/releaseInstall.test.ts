import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

/**
 * The release is built from the lockfile, as CI builds every pull request.
 *
 * `release.yml` used to delete `package-lock.json` and resolve every
 * dependency afresh with `npm install` (#292, #293), so each weekly release
 * was built from versions no pull request had been tested with. rolldown
 * 1.2.15 arrived that way and broke the builds of October 26 and November 2
 * (#1654). `npm ci` installs exactly what the lockfile says, as ci.yml's jobs
 * do on the same runner image.
 *
 * Parsed by hand, as `ciJobDependencies.test.ts` parses ci.yml: a test
 * guarding CI should not be the thing that adds a YAML dependency.
 */

const ROOT = resolve(__dirname, '../..');
const RELEASE = join(ROOT, '.github/workflows/release.yml');
const CI = join(ROOT, '.github/workflows/ci.yml');

/**
 * Every shell line a workflow runs: the value of each `run:` key, inline or
 * as a block, trimmed, with comments and blank lines left out.
 *
 * @param body The workflow file
 * @returns The lines, in file order
 */
function runLines(body: string): string[] {
  const lines = body.split('\n');
  const commands: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const run = /^(\s*)(?:- )?run:(.*)$/.exec(lines[i]);
    if (!run) {
      continue;
    }
    const indent = run[1];
    const value = run[2].trim();
    if (!/^[|>][-+]?$/.test(value)) {
      commands.push(value);
      continue;
    }
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() !== '' && line.search(/\S/) <= indent.length) {
        break;
      }
      if (line.trim() !== '' && !line.trim().startsWith('#')) {
        commands.push(line.trim());
      }
    }
  }
  return commands;
}

describe('the release workflow', () => {
  const release = runLines(readFileSync(RELEASE, 'utf8'));

  test('parses into commands, so the cases below are not vacuous', () => {
    expect(release).toContain('npm run build');
    expect(release).toContain('npx semantic-release');
  });

  test('installs the dependencies from the lockfile', () => {
    expect(release).toContain('npm ci');
  });

  test('neither deletes the lockfile nor resolves the dependencies afresh', () => {
    // `npm install -g npm@latest` upgrades npm itself for trusted
    // publishing; it installs nothing the build reads.
    expect(release.filter(line => line.includes('package-lock.json'))).toEqual([]);
    expect(release.filter(line => /^npm (?:install|i)\b(?!.* -g\b)/.test(line))).toEqual([]);
  });

  test('installs the way the CI build it releases was tested', () => {
    const ci = runLines(readFileSync(CI, 'utf8'));

    expect(ci).toContain('npm ci');
    expect(ci).toContain('npm run build');
  });
});
