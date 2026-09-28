'use strict';

/**
 * The issue the release workflow files when r-maidr, py-maidr or maidr-skill
 * was not told about a release.
 *
 * The notify step in `.github/workflows/release.yml` runs under
 * `continue-on-error`: a missed ping must never fail a release that npm has
 * already accepted. That also meant a miss left the run green, and 4.11.0 is
 * what it cost: the token then used could not dispatch to maidr-skill (HTTP
 * 403), r-maidr and py-maidr gave up before npm served the version, and
 * nothing said so until a maintainer went looking. So when that step fails,
 * the step after it calls this, and the miss becomes an issue.
 *
 * The notify step reports through its outputs, which the workflow passes in
 * as environment variables: `VERSION`; `FAILURE`, one of `token`, `registry`
 * or `dispatch`, empty if the step died before saying; `MISSED`, the
 * repositories a dispatch failed for, space-separated; and `REASONS`, one
 * line per such repository, as `gh` put it.
 *
 * CommonJS, and `.cjs`, for the reasons `e2eReport.cjs` gives.
 * `test/scripts/releaseNotifyIssue.test.ts` exercises it and pins the
 * workflow's side of the contract.
 */

const process = require('node:process');

/**
 * An issue as `listForRepo` returns it, narrowed to what this file reads.
 * @typedef {{ number: number, title: string, pull_request?: object }} Issue
 */

/**
 * The octokit surface this file uses; see `e2eReport.cjs` for why it is
 * narrowed by hand.
 * @typedef {object} Github
 * @property {(route: unknown, params: object) => Promise<Issue[]>} paginate - Walks every page of a list endpoint.
 * @property {{ issues: {
 *   listForRepo: unknown,
 *   create: (params: { owner: string, repo: string, title: string, body: string, labels: string[] }) => Promise<{ data: { number: number } }>,
 *   createComment: (params: { owner: string, repo: string, issue_number: number, body: string }) => Promise<unknown>,
 * } }} rest - The REST endpoints this file calls.
 */

/**
 * The workflow run context, narrowed to the fields the issue links to.
 * @typedef {object} Context
 * @property {{ owner: string, repo: string }} repo - Where the run happened.
 * @property {number} runId - Identifies the run, for the link back to it.
 * @property {string} serverUrl - The GitHub host, for the same link.
 */

/**
 * The actions toolkit core, narrowed to the one call this file makes.
 * @typedef {{ info: (message: string) => void }} Core
 */

/**
 * The repositories the notify step pings, in its order.
 *
 * The test checks this against the step's loop and the token's scope, since
 * the three must agree and nothing else makes them.
 */
const RECEIVERS = ['xability/r-maidr', 'xability/py-maidr', 'xability/maidr-skill'];

/**
 * How each receiver catches up without the ping, so the issue can say how
 * long a miss lasts if nobody acts on it.
 * @type {Record<string, string>}
 */
const FALLBACK = {
  'xability/r-maidr': 'its daily refresh at 09:00 UTC (`update-maidr-bundle.yml`)',
  'xability/py-maidr': 'its next release, which re-resolves maidr.js (`release.yml`); it has no scheduled refresh',
  'xability/maidr-skill': 'its daily refresh at 16:17 UTC (`update-bundle.yml`)',
};

const LABELS = ['devops', 'automated'];

const APP = 'https://github.com/organizations/xability/settings/apps/maidr-release-dispatch';
const INSTALLATIONS = 'https://github.com/organizations/xability/settings/installations';

/**
 * The title, which is also how a second failure for the same version finds
 * the first one's issue.
 * @param {string} version - The release, without the `v`.
 * @returns {string} The title.
 */
function titleFor(version) {
  return `release: v${version} did not reach the downstream repositories`;
}

/**
 * What went wrong and where to look, for the failure the step reported.
 * @param {string} failure - `token`, `registry`, `dispatch`, or empty.
 * @param {string} version - The release, without the `v`.
 * @param {string} reasons - One line per refused repository, from `gh`.
 * @returns {string} Markdown for the issue's "Why" section.
 */
function causeOf(failure, version, reasons) {
  switch (failure) {
    case 'token':
      return [
        'The workflow could not mint a token from the `maidr-release-dispatch` GitHub App (see the "Mint a token for the downstream repositories" step).',
        `Check that the \`NPM_TOKEN\` environment still has the \`DOWNSTREAM_APP_CLIENT_ID\` variable and the \`DOWNSTREAM_APP_PRIVATE_KEY\` secret, that the key has not been deleted in [the app's settings](${APP}), and that [the app is still installed](${INSTALLATIONS}) on the three repositories.`,
      ].join(' ');
    case 'registry':
      return `npm did not serve [maidr@${version}](https://www.npmjs.com/package/maidr/v/${version}) within an hour of the publish step, so the workflow told no one rather than send each repository after a version that was not there. Once npm serves it, send the notification below.`;
    case 'dispatch':
      return [
        'GitHub refused the dispatch:',
        '',
        '```',
        reasons.trim() || '(no reason recorded)',
        '```',
        '',
        `A 403 or 404 usually means [the \`maidr-release-dispatch\` app](${INSTALLATIONS}) is no longer installed on that repository or no longer has Contents: read and write.`,
      ].join('\n');
    default:
      return 'The notify step failed before recording why; the run log has the details.';
  }
}

/**
 * Files the issue for a release the downstream repositories were not told
 * about, or comments on the one already open for that release.
 * @param {{ github: Github, context: Context, core: Core }} bindings - What github-script provides.
 * @returns {Promise<void>}
 */
async function notifyIssue({ github, context, core }) {
  const { VERSION = '', FAILURE = '', MISSED = '', REASONS = '' } = process.env;
  const run = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const missed = FAILURE === 'dispatch' ? MISSED.split(/\s+/).filter(Boolean) : [];
  // A notify step that failed without naming a repository it could not tell
  // failed some other way than a refused dispatch, and saying otherwise would
  // send whoever reads the issue after the wrong cause.
  const failure = FAILURE === 'dispatch' && !missed.length ? '' : FAILURE;
  const untold = missed.length ? missed : RECEIVERS;
  const title = titleFor(VERSION);

  const open = await github.paginate(github.rest.issues.listForRepo, {
    ...context.repo,
    state: 'open',
    labels: LABELS.join(','),
    per_page: 100,
  });
  const existing = open.find(issue => !issue.pull_request && issue.title === title);
  if (existing) {
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: existing.number,
      body: `The notify step failed again (${failure || 'no reason recorded'}): ${run}`,
    });
    core.info(`Commented on #${existing.number}: ${title}`);
    return;
  }

  const body = [
    `The release workflow published maidr@${VERSION} to npm but did not tell the repositories below, so each will pick it up only on its own schedule:`,
    '',
    ...untold.map(repo => `- ${repo}: ${FALLBACK[repo] || 'its own refresh path'}`),
    '',
    '## Why',
    '',
    causeOf(failure, VERSION, REASONS),
    '',
    `Run: ${run}`,
    '',
    '## Once the cause is fixed',
    '',
    'Send the notification the workflow would have sent, as a maintainer (`gh auth login`):',
    '',
    '```sh',
    `for repo in ${untold.join(' ')}; do`,
    `  gh api "repos/$repo/dispatches" -f event_type=maidr-released -f 'client_payload[version]=${VERSION}'`,
    'done',
    '```',
  ].join('\n');

  const { data } = await github.rest.issues.create({ ...context.repo, title, body, labels: LABELS });
  core.info(`Filed #${data.number}: ${title}`);
}

module.exports = { notifyIssue, RECEIVERS };
