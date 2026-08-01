import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

/**
 * Exercises the `github-script` body in the scheduled e2e workflow.
 *
 * That script only fires on `schedule`, so no pull request can run it. The
 * body is read out of the YAML rather than copied here, so what is tested is
 * what runs. Octokit is stubbed, and the stub caps an unpaginated
 * `listForRepo` at 30 the way the real API does — without that the pagination
 * cases would pass against either version.
 *
 * Extracted textually rather than parsed: `js-yaml` and `yaml` are present
 * but only transitively, and a test resting on an undeclared dependency
 * breaks when something upstream stops pulling it in. That argument expires
 * if either becomes a direct devDependency for another reason — parse the
 * workflow then and delete `reportScript`, since block-scalar spelling and
 * indentation are a class of bug a parser does not have. Adding the
 * dependency solely to delete this is the trade that is not worth it.
 */

interface StubIssue {
  number: number;
  title: string;
  labels: string[];
  /** Defaults to open; a closed one must never be picked up. */
  state?: 'open' | 'closed';
  pull_request?: object;
}

interface RunResult {
  /** Issue numbers closed by this run. */
  closed: number[];
  /** Issue numbers commented on. */
  commented: number[];
  /** Labels passed to `issues.create`, if it filed a new report. */
  created: string[][];
  /** True if any lookup bypassed `paginate`. */
  usedUnpaginatedList: boolean;
  /** Warnings the script emitted instead of throwing. */
  warnings: string[];
  /** Issue numbers whose title/body were rewritten as the rolling report. */
  adopted: number[];
}

/** Issue numbers whose API calls should reject, to test the catch blocks. */
type Failing = ReadonlySet<number>;

const ROOT = resolve(__dirname, '../..');
const WORKFLOW = join(ROOT, '.github/workflows/e2e_tests.yml');

/**
 * Matches the header of a `script:` block scalar.
 *
 * Wider than the form used today, since YAML also spells it `|-`, `|+`, `|2`,
 * and takes the two indicators in either order. Missing one of those would
 * report "no script block", which reads as though the step were deleted.
 *
 * Looser than the grammar too — it admits `|--`. This recognises a header so
 * the error can name the real cause; validating YAML is actionlint's job.
 */
const SCRIPT_HEADER = /^\s*script: \|[-+\d]*\s*$/;

/**
 * The github-script body from the report step, as it will run in CI.
 *
 * Takes everything indented past the `script:` line and removes that
 * indentation, which is what a YAML block scalar means. The indentation is
 * measured from the block's first line rather than assumed to be the header's
 * plus two — that assumption describes this file's current formatting, not
 * anything YAML requires, and dedenting the block would slice into the code.
 */
function reportScript(): string {
  const lines = readFileSync(WORKFLOW, 'utf8').split('\n');
  const starts = lines.reduce<number[]>(
    (found, line, i) => (SCRIPT_HEADER.test(line) ? [...found, i] : found),
    [],
  );
  if (starts.length === 0) {
    throw new Error(`No "script:" block scalar in ${WORKFLOW}`);
  }
  // Taking the first block is only unambiguous while there is one. A second
  // github-script step added above this one would otherwise be extracted
  // instead, and every case below would still pass — against the wrong
  // script. Fail loudly and make whoever adds it say which block they mean.
  if (starts.length > 1) {
    throw new Error(
      `${WORKFLOW} has ${starts.length} "script:" blocks; this test assumes `
      + 'one and would silently extract the first. Select the report step '
      + 'explicitly before adding another.',
    );
  }
  const [start] = starts;

  const rest = lines.slice(start + 1);
  const first = rest.find(line => line.trim());
  if (first === undefined) {
    throw new Error(`The "script:" block in ${WORKFLOW} is empty`);
  }
  const indent = (first.match(/^\s*/) ?? [''])[0].length;

  const body: string[] = [];
  for (const line of rest) {
    if (line.trim() && !line.startsWith(' '.repeat(indent))) {
      break;
    }
    body.push(line.slice(indent));
  }

  if (!body.some(line => line.includes('github.rest.issues'))) {
    throw new Error('Extracted block does not look like the report script');
  }
  return body.join('\n');
}

/** Runs the script against stubs and records what it asked GitHub to do. */
async function runScript(
  status: string | undefined,
  issues: StubIssue[],
  failingUpdates: Failing = new Set(),
  failingComments: Failing = new Set(),
): Promise<RunResult> {
  const result: RunResult = {
    closed: [],
    commented: [],
    created: [],
    usedUnpaginatedList: false,
    warnings: [],
    adopted: [],
  };

  // Honours `state` as well as `labels`, so a query that dropped
  // `state: 'open'` would start seeing closed issues and fail a test rather
  // than passing because every fixture happened to be open.
  const matching = (params: { labels: string[]; state?: string }): StubIssue[] =>
    issues.filter(issue =>
      issue.labels.includes(params.labels[0])
      && (params.state === 'all' || (issue.state ?? 'open') === (params.state ?? 'open')),
    );

  const github = {
    paginate: async (_fn: unknown, params: { labels: string[]; state?: string }) =>
      matching(params),
    rest: {
      issues: {
        // The real API pages at 30; a caller that skips `paginate` sees no more.
        listForRepo: async (params: { labels: string[]; state?: string }) => {
          result.usedUnpaginatedList = true;
          return { data: matching(params).slice(0, 30) };
        },
        create: async (params: { labels: string[] }) => {
          result.created.push(params.labels);
        },
        createComment: async (params: { issue_number: number }) => {
          if (failingComments.has(params.issue_number)) {
            throw new Error('simulated API failure');
          }
          result.commented.push(params.issue_number);
        },
        update: async (params: { issue_number: number; state?: string }) => {
          if (failingUpdates.has(params.issue_number)) {
            throw new Error('simulated API failure');
          }
          if (params.state === 'closed') {
            result.closed.push(params.issue_number);
          } else {
            result.adopted.push(params.issue_number);
          }
        },
      },
    },
  };

  const core = {
    warning: (message: string) => result.warnings.push(message),
  };

  const context = {
    repo: { owner: 'xability', repo: 'maidr' },
    runId: 1,
    sha: 'abc123',
    ref: 'refs/heads/main',
  };

  // `runInNewContext` rather than `new Function`: the same execution, without
  // tripping `no-new-func`, and the sandbox makes the globals the script is
  // allowed to see explicit. The script reads the reporter output through
  // `fs`; an absent file is a case it already handles, which keeps this from
  // needing a fixture.
  // `Error` is shared rather than left to the sandbox's own. github-script
  // runs the script and octokit in one realm, so a thrown error is an
  // instance of the same constructor the script tests against. A fresh
  // context gets its own, and `error instanceof Error` on an error the stubs
  // built out here would be false — sending the script down its non-Error
  // path on every failure case, and testing the branch production never
  // takes. Passing it in makes the sandbox model production's single realm.
  const sandbox = {
    github,
    context,
    core,
    require,
    process: { env: { TEST_STATUS: status } },
    Date,
    Error,
  };

  await runInNewContext(`(async () => {\n${reportScript()}\n})()`, sandbox);
  return result;
}

/** A report as this workflow files it. */
function botIssue(number: number): StubIssue {
  return {
    number,
    title: 'test: Some e2e tests failed - 2026-07-31T03:20:11.879Z',
    labels: ['test-failure'],
  };
}

describe('the scheduled e2e report step', () => {
  describe('when the suite passes', () => {
    it('should close the failure issue it had filed', async () => {
      const result = await runScript('success', [botIssue(683)]);

      expect(result.commented).toEqual([683]);
      expect(result.closed).toEqual([683]);
    });

    it('should close every open failure issue, not one page of them', async () => {
      const many = Array.from({ length: 35 }, (_, i) => botIssue(700 + i));

      const result = await runScript('success', many);

      expect(result.closed).toHaveLength(35);
      expect(result.usedUnpaginatedList).toBe(false);
    });

    it('should leave an issue a human labelled test-failure alone', async () => {
      const humanFiled: StubIssue = {
        number: 500,
        title: 'fix: heatmap autoplay skips the last row',
        labels: ['test-failure'],
      };

      const result = await runScript('success', [humanFiled, botIssue(683)]);

      expect(result.closed).toEqual([683]);
      expect(result.commented).toEqual([683]);
    });

    it('should skip a pull request carrying the label', async () => {
      const pr: StubIssue = {
        number: 999,
        title: 'test: Some e2e tests failed - fixing it',
        labels: ['test-failure'],
        pull_request: {},
      };

      const result = await runScript('success', [pr, botIssue(683)]);

      expect(result.closed).toEqual([683]);
    });

    it('should file its own report', async () => {
      const result = await runScript('success', []);

      expect(result.created).toEqual([['test-report']]);
      expect(result.closed).toEqual([]);
    });

    // The lookups pass `state: 'open'`. Without this every fixture is open,
    // so dropping that filter would change nothing here and the argument
    // would be decorative rather than covered.
    it('should ignore a failure issue that is already closed', async () => {
      const alreadyClosed: StubIssue = { ...botIssue(600), state: 'closed' };

      const result = await runScript('success', [alreadyClosed, botIssue(683)]);

      expect(result.closed).toEqual([683]);
      expect(result.commented).toEqual([683]);
    });

    it('should keep going when one issue cannot be retired', async () => {
      const result = await runScript(
        'success',
        [botIssue(683), botIssue(684), botIssue(685)],
        new Set([684]),
      );

      // The other two still close, and the step does not throw.
      expect(result.closed).toEqual([683, 685]);
      expect(result.warnings).toEqual([
        expect.stringContaining('Could not close #684') as unknown as string,
      ]);
      // The bare message, not `String(error)` — which would read
      // "Error: simulated API failure". Asserting only the surrounding
      // template text leaves both branches of `reason()` passing.
      expect(result.warnings[0]).toContain(': simulated API failure');
      expect(result.warnings[0]).not.toContain('Error: simulated');
    });

    // Closing comes before commenting, so a close that fails leaves no note
    // behind. Otherwise the issue stays open, matches again next run, and
    // collects a fresh "green again" comment every cycle.
    it('should not comment on an issue it failed to close', async () => {
      const result = await runScript(
        'success',
        [botIssue(683), botIssue(684)],
        new Set([684]),
      );

      expect(result.commented).toEqual([683]);
    });

    // The close and the comment are caught separately, and this is the case
    // that tells them apart: the close worked, so the issue must stay closed
    // rather than being reopened or retried. It also must not be reported as
    // "could not retire" — it was retired; only the note was lost, and since
    // the issue is closed no later run will look at it again.
    it('should stay closed when only the comment fails', async () => {
      const result = await runScript(
        'success',
        [botIssue(683), botIssue(684)],
        new Set(),
        new Set([684]),
      );

      expect(result.closed).toEqual([683, 684]);
      expect(result.commented).toEqual([683]);
      expect(result.warnings).toEqual([
        expect.stringContaining('Closed #684') as unknown as string,
      ]);
    });

    // `includes` would match this; only `startsWith` does not. The bot's own
    // titles always begin with the prefix, so nothing is lost by requiring it.
    it('should leave a human issue that merely mentions the prefix', async () => {
      const humanFiled: StubIssue = {
        number: 501,
        title: 'Investigate: test: Some e2e tests failed intermittently on Safari',
        labels: ['test-failure'],
      };

      const result = await runScript('success', [humanFiled, botIssue(683)]);

      expect(result.closed).toEqual([683]);
      expect(result.commented).toEqual([683]);
    });
  });

  describe('when it looks for the rolling issue', () => {
    // The lookup rewrites the title and body of whatever it adopts, so a pull
    // request adopted by mistake would be silently overwritten.
    it('should not adopt a pull request as the rolling report', async () => {
      const pr: StubIssue = {
        number: 999,
        title: 'Test Report - a pull request',
        labels: ['test-report'],
        pull_request: {},
      };

      const result = await runScript('success', [pr]);

      expect(result.adopted).toEqual([]);
      expect(result.created).toEqual([['test-report']]);
    });

    // The retire loop's `state: 'open'` is pinned by the already-closed
    // failure case above; this is the same filter on the other lookup, which
    // had no closed fixture. Reopening a finished report to write a new run
    // into it would resurrect an issue someone deliberately closed.
    it('should file a fresh report rather than reopen a closed one', async () => {
      const closedReport: StubIssue = {
        number: 601,
        title: 'Test Report - 2026-07-29T03:20:11.879Z',
        labels: ['test-report'],
        state: 'closed',
      };

      const result = await runScript('success', [closedReport]);

      expect(result.adopted).toEqual([]);
      expect(result.created).toEqual([['test-report']]);
    });

    // The same guard, reached through the other branch of the prefix ternary.
    // One line serves both paths today, so this is cheap insurance rather
    // than new coverage — but the failure path is the one that runs when
    // something is already wrong, and it had no PR case at all.
    it('should not adopt a pull request on the failure path either', async () => {
      const pr: StubIssue = {
        number: 998,
        title: 'test: Some e2e tests failed - a pull request',
        labels: ['test-failure'],
        pull_request: {},
      };

      const result = await runScript('failure', [pr]);

      expect(result.adopted).toEqual([]);
      expect(result.created).toEqual([['test-failure']]);
    });
  });

  describe('when the suite fails', () => {
    it('should close nothing', async () => {
      const result = await runScript('failure', [botIssue(683)]);

      expect(result.closed).toEqual([]);
      expect(result.commented).toEqual([]);
    });

    // A cancelled run — the 60-minute timeout interrupting a hung suite — is
    // not a pass, and must be reported as a failure rather than silently
    // retiring the issue that is still true.
    it('should treat a cancelled run as a failure', async () => {
      const result = await runScript('cancelled', [botIssue(683)]);

      expect(result.closed).toEqual([]);
    });

    // What the workflow actually passes when the test step never ran: the
    // env is `${{ steps.e2e.outcome }}`, and an unreached step's outcome is
    // the empty string, not an absent variable. `!== 'success'` covers both,
    // but only by accident of how it is written — an equality check against
    // a failure list would not, and nothing here would have noticed.
    // No fixtures: with an open failure issue present the script updates it
    // instead of filing one, and `created` would be empty on both the success
    // and failure paths — which is the same answer for the two cases this is
    // meant to tell apart.
    it('should treat an empty status as a failure', async () => {
      const result = await runScript('', []);

      expect(result.created).toEqual([['test-failure']]);
    });

    it('should treat an absent status as a failure', async () => {
      const result = await runScript(undefined, []);

      expect(result.created).toEqual([['test-failure']]);
    });
  });
});
