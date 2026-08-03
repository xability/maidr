'use strict';

/**
 * The report step of the scheduled e2e workflow.
 *
 * Files a rolling issue for the suite's result, and retires the failure issues
 * a previous run left behind once the suite is green again. Lifted out of
 * `.github/workflows/e2e_tests.yml`, where it was ~180 lines inside a YAML
 * block scalar — the only code in the repo neither eslint nor a test could
 * reach without first parsing it back out of the workflow (#694).
 *
 * CommonJS, and `.cjs` rather than `.js`, for two reasons that both come from
 * the outside:
 *
 * - `package.json` sets `"type": "module"`, so a `.js` here would be ESM.
 *   github-script's `script:` body runs as CommonJS and reaches the workspace
 *   with `require`, and requiring an ES module is a Node-version-dependent
 *   affordance rather than a guarantee. `.cjs` is unambiguous everywhere.
 * - `test/scripts/e2eReportWorkflow.test.ts` runs in Jest's CommonJS project.
 *   Making this ESM would move that file to the `esm` project, which is the
 *   arrangement #703 is about — two projects disagreeing about one path is
 *   exactly the failure mode the runner exists to avoid.
 */

const fs = require('node:fs');
const process = require('node:process');

/**
 * An issue as `listForRepo` returns it, narrowed to what this file reads.
 *
 * `pull_request` is present only on pull requests, which is how the REST API
 * distinguishes them from issues in the same list.
 * @typedef {{ number: number, title: string, pull_request?: object }} Issue
 */

/** Where the Playwright reporter output is written by the test step. */
const RESULTS_PATH = 'test-results.txt';

/**
 * Ceiling on the reporter output embedded in the issue body.
 *
 * An issue body caps at 65536 characters; this leaves room for the surrounding
 * report and the truncation notice.
 */
const MAX_RESULTS = 60000;

/**
 * Title prefix for the issue filed when the suite is red.
 *
 * Named once because it identifies this step's own issues in three places
 * below, and two literals that must agree are two literals that can drift.
 */
const FAILURE_PREFIX = 'test: Some e2e tests failed';

/** Title prefix for the issue filed when the suite is green. */
const REPORT_PREFIX = 'Test Report';

/**
 * Whether an issue is one this step filed under the given prefix.
 *
 * The label alone is not proof of authorship: a maintainer tracking a flaky
 * spec could reasonably reach for `test-failure`, and closing it with "fixed
 * by the run that passed" is a claim this step cannot know is false. Only this
 * step writes the title prefix.
 *
 * `startsWith`, not `includes` — a human title can mention the prefix partway
 * through and mean something else. And `listForRepo` returns pull requests,
 * which are neither.
 * @param {Issue} issue - The issue to test.
 * @param {string} prefix - The title prefix to match.
 * @returns {boolean} True if this step filed it.
 */
function isOwn(issue, prefix) {
  return !issue.pull_request && issue.title.startsWith(prefix);
}

/**
 * A failure's message, for the warnings that are its only record.
 *
 * `.message` on a non-Error is undefined, so a rejected value that is not an
 * Error would otherwise warn with nothing in it.
 * @param {unknown} error - Whatever was thrown.
 * @returns {string} Something printable.
 */
function reason(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reads the reporter output, keeping the tail if it is large.
 *
 * The summary is at the end of the reporter output, so the tail is the part
 * worth keeping when it will not fit.
 * @returns {string} The output, or a note that there was none.
 */
function results() {
  const raw = fs.existsSync(RESULTS_PATH)
    ? fs.readFileSync(RESULTS_PATH, 'utf8')
    : 'No test output was captured (the test step did not run).';

  return raw.length > MAX_RESULTS
    ? `… (truncated, full output in the workflow run)\n${raw.slice(-MAX_RESULTS)}`
    : raw;
}

/**
 * Files or updates this run's report issue, and retires stale failures.
 * @param {object} api - The github-script bindings.
 * @param {any} api.github - The authenticated octokit client.
 * @param {any} api.context - The workflow run context.
 * @param {any} api.core - The actions toolkit core, for warnings.
 * @returns {Promise<void>} Resolves once the issues are settled.
 */
module.exports = async function report({ github, context, core }) {
  const { repo, owner } = context.repo;
  const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${context.runId}`;

  const reportContent = [
    '## Test Execution Report',
    `Date: ${new Date().toISOString()}`,
    `Repository: ${owner}/${repo}`,
    `Branch: ${context.ref}`,
    `Commit: ${context.sha}`,
    '',
    '### Test Results',
    '```',
    results(),
    '```',
    '',
    `[View Workflow Run](${runUrl})`,
  ].join('\n');

  // Anything other than success (failure, cancelled — e.g. the job timeout
  // interrupting a hung run) must be filed as a failure.
  const isFailure = process.env.TEST_STATUS !== 'success';
  const prefix = isFailure ? FAILURE_PREFIX : REPORT_PREFIX;
  const title = `${prefix} - ${new Date().toISOString()}`;
  const labels = isFailure ? ['test-failure'] : ['test-report'];

  // Paginated: listForRepo caps at 30 per page by default, and a report older
  // than one page would be invisible here — which reads as "no rolling issue
  // exists" and files a duplicate.
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    labels,
    state: 'open',
  });

  // Match on the stable title prefix only: the body always embeds the CURRENT
  // run's URL, so matching on it could never find an issue from a previous run
  // — each scheduled failure would file a brand-new issue instead of updating
  // the rolling one.
  //
  // What this does with a match is rewrite its title and body, so adopting a
  // pull request by mistake overwrites it.
  const existing = issues.find(/** @param {Issue} issue */ issue => isOwn(issue, prefix));

  if (existing) {
    await github.rest.issues.update({
      owner,
      repo,
      issue_number: existing.number,
      title,
      body: reportContent,
    });
  } else {
    await github.rest.issues.create({
      owner,
      repo,
      title,
      body: reportContent,
      labels,
    });
  }

  if (isFailure) {
    return;
  }

  // A green run retires the failure issue as well as filing its own report.
  // Without this, success only ever touched `test-report` and a failure report
  // outlived its fix, with no number of green runs able to close it.
  //
  // Every open one, not just the newest: the titles carry timestamps, so a
  // failing period can leave several behind.
  //
  // Paginated for the same reason as above — anything past the first page
  // would silently stay open.
  const stale = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    labels: ['test-failure'],
    state: 'open',
  });

  // Always the failure prefix: this branch only runs on success, so the issues
  // to retire are the failures a previous run filed.
  const mine = stale.filter(/** @param {Issue} issue */ issue => isOwn(issue, FAILURE_PREFIX));

  for (const issue of mine) {
    // Caught per issue: an uncaught throw would fail the step and report a
    // green suite as a red run.
    //
    // Close before comment. A failed close usually leaves the issue open and
    // matching, so the next green run retries it with no comment already
    // posted to duplicate. The reverse order leaves the stale report standing
    // and adds a note every cycle. "Usually" because a lost response looks the
    // same as a refused one — the close may have landed — so the retry is
    // best-effort.
    try {
      await github.rest.issues.update({
        owner,
        repo,
        issue_number: issue.number,
        state: 'closed',
        state_reason: 'completed',
      });
    } catch (error) {
      core.warning(
        `Could not close #${issue.number}, leaving it for the next `
        + `green run: ${reason(error)}`,
      );
      continue;
    }

    // Caught separately because only the close is ever retried. By the time
    // this runs the issue is closed, and the `state: 'open'` filter means no
    // later run will see it, so one shared handler would report a closed issue
    // as still pending.
    try {
      await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: issue.number,
        body: [
          'The scheduled suite is green again.',
          '',
          `Commit: ${context.sha}`,
          `[View Workflow Run](${runUrl})`,
          '',
          'Closed automatically by the run that passed. If these',
          'tests fail again a fresh issue is filed rather than this',
          'one reopened, so the history stays per-incident.',
        ].join('\n'),
      });
    } catch (error) {
      core.warning(
        `Closed #${issue.number} but could not comment on it; the `
        + `run that fixed it is in this log only: ${reason(error)}`,
      );
    }
  }
};
