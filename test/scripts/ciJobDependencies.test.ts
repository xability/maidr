import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

/**
 * `needs` decides what runs, not just what runs first.
 *
 * A job whose dependency fails is **skipped**, and GitHub renders a skip in
 * grey. So listing `commitlint` in `needs` meant a commit subject that did not
 * parse took the build, the type check, the whole unit suite and every e2e
 * spec down with it — and the checks list then read as "one formatting
 * problem" rather than "nothing was tested" (#763).
 *
 * That is not hypothetical. On #669 three real breakages sat under those
 * greyed-out checks, one of them a published bundle that threw on load, which
 * the build and the unit suite cannot catch because they import source rather
 * than the built artefact. Only e2e could, and e2e was skipped.
 *
 * Parsed by hand rather than with a YAML library: neither `yaml` nor
 * `js-yaml` is a direct dependency, and a test guarding CI should not be the
 * thing that adds one.
 */

const ROOT = resolve(__dirname, '../..');
const CI = join(ROOT, '.github/workflows/ci.yml');

interface Job {
  /** The job's key, as `jobs:` spells it. */
  id: string;
  /** What the job declares in `needs`, empty when it declares nothing. */
  needs: string[];
}

/**
 * Read the jobs of a workflow and what each one waits for.
 *
 * Scanning starts at `jobs:` rather than at the top of the file. `on:` puts
 * its triggers at the same two-space indent, so an unscoped scan reports
 * `workflow_dispatch` and `pull_request` as jobs — harmless for the
 * assertions that name an id, but it makes the "there are jobs here" sanity
 * check count things that are not jobs, which is the one case whose whole
 * purpose is to be trustworthy.
 *
 * @param body The workflow file
 * @returns One entry per job, in file order
 */
function jobsOf(body: string): Job[] {
  const lines = body.split('\n');
  const start = lines.findIndex(line => /^jobs:\s*$/.test(line));
  const jobs: Job[] = [];

  if (start < 0) {
    return jobs;
  }

  for (const line of lines.slice(start + 1)) {
    // A key at the top level ends the `jobs:` block.
    if (/^\S/.test(line)) {
      break;
    }

    const job = /^ {2}([\w-]+):\s*$/.exec(line);
    if (job) {
      jobs.push({ id: job[1], needs: [] });
      continue;
    }

    const needs = /^ {4}needs: *(\S.*)$/.exec(line);
    if (needs && jobs.length > 0) {
      jobs[jobs.length - 1].needs = needs[1]
        .replace(/[[\]]/g, '')
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
    }
  }

  return jobs;
}

describe('the CI workflow', () => {
  const jobs = jobsOf(readFileSync(CI, 'utf8'));

  test('parses into jobs, so the cases below are not vacuous', () => {
    // A regex that stopped matching would make every assertion here pass.
    expect(jobs.length).toBeGreaterThan(5);
    expect(jobs.map(job => job.id)).toContain('commitlint');

    // And they really are jobs: `on:` indents its triggers the same way, so
    // a scan that started at the top of the file would count them.
    expect(jobs.map(job => job.id)).not.toContain('pull_request');
    expect(jobs.map(job => job.id)).not.toContain('workflow_dispatch');
  });

  test('never lets a commit message decide whether anything is tested', () => {
    const gated = jobs.filter(job => job.needs.includes('commitlint'));

    expect(gated.map(job => job.id)).toEqual([]);
  });

  test('still runs commitlint, which blocks the merge on its own', () => {
    // Removing it from `needs` is only safe because it remains a required
    // check in its own right. Deleting the job would let a malformed subject
    // through, which is the opposite mistake.
    expect(jobs.map(job => job.id)).toContain('commitlint');
  });

  test('keeps the verification jobs behind the code lint', () => {
    // `lint` inspects the code under test rather than the message describing
    // it, and there is no point running e2e on code that will not lint. This
    // asserts the ordering that was kept, so a change that dropped every
    // `needs` would not pass as a fix for the one that was removed.
    const verification = ['e2e-chromium', 'build', 'unit-test', 'type-check'];
    const declared = jobs.filter(job => verification.includes(job.id));

    expect(declared.length).toBe(verification.length);
    for (const job of declared) {
      expect(job.needs).toEqual(['lint']);
    }
  });
});
