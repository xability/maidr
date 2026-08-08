import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Exercises the report step of the scheduled e2e workflow.
 *
 * That step only fires on `schedule`, so no pull request can run it. It calls
 * `scripts/ci/e2eReport.cjs`, which this imports directly — before #694 the
 * body lived in a YAML block scalar and had to be read back out of the
 * workflow, and every defect found in that extraction produced a *passing*
 * suite that was testing the wrong thing (or nothing).
 *
 * Octokit is stubbed, and the stub caps an unpaginated `listForRepo` at 30 the
 * way the real API does — without that the pagination cases would pass against
 * either version.
 *
 * `require` rather than `import`: the module is `.cjs` because github-script
 * loads it with `require` and `package.json` is `"type": "module"`. This file
 * runs in Jest's CommonJS project, so requiring it is the same resolution
 * production gets.
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

/**
 * The github-script bindings the module is handed.
 *
 * `unknown` rather than the shapes `e2eReport.cjs` declares in JSDoc, because
 * nothing type-checks this call against those: the root `tsconfig.json` sets
 * `allowJs: false`, so the project ts-jest checks against never loads the
 * module. Only `tsconfig.ci.json` does, and that one covers `scripts/ci/**`
 * rather than `test/`. Restating the shapes here would be a second copy free
 * to drift from the first, which is worse than admitting the gap.
 */
interface Bindings {
  github: unknown;
  context: unknown;
  core: unknown;
}

const ROOT = resolve(__dirname, '../..');
const MODULE = join(ROOT, 'scripts/ci/e2eReport.cjs');

// eslint-disable-next-line ts/no-require-imports -- CommonJS module; see the docblock.
const report = require(MODULE) as (api: Bindings) => Promise<void>;

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

  // The module reads `TEST_STATUS` from the environment, as github-script's
  // `env:` gives it. Set and restored per call rather than injected, because
  // the module reads `process.env` directly and a stub would test a seam that
  // does not exist in production.
  const previous = process.env.TEST_STATUS;
  if (status === undefined) {
    delete process.env.TEST_STATUS;
  } else {
    process.env.TEST_STATUS = status;
  }

  try {
    await report({ github, context, core });
  } finally {
    if (previous === undefined) {
      delete process.env.TEST_STATUS;
    } else {
      process.env.TEST_STATUS = previous;
    }
  }

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

/**
 * The seam the module split opened.
 *
 * Every case above imports the module directly, which is the point of #694 —
 * but it also means they pass whether or not the workflow still calls it.
 * Before the split the body was read out of the YAML, so deleting the step
 * broke the suite; afterwards, gutting the step leaves all 17 green. Verified
 * by gutting it: 1341 passed, 0 failed.
 *
 * So this asserts the one thing the others no longer can. It reads the raw
 * YAML rather than parsing it, but nothing here depends on block-scalar
 * spelling or indentation — the class of defect that made the old extraction
 * worth deleting. It only asks whether the two files still name each other.
 */
describe('the workflow step', () => {
  const workflow = readFileSync(
    join(ROOT, '.github/workflows/e2e_tests.yml'),
    'utf8',
  );

  // The whole require expression, not just the path. A comment naming the
  // module satisfies "mentions the path" — the comment above the step in this
  // very workflow does — so that weaker form passed against a step whose call
  // had been replaced by `core.info(...)`. Found by running exactly that.
  //
  // Resolved against the workspace, and that part is load-bearing:
  // github-script resolves a relative `require` against the action's install
  // directory, not the checkout, so a plain './scripts/…' would throw at
  // runtime — on a schedule, where nobody is watching.
  it('should still require the module these cases exercise', () => {
    // eslint-disable-next-line no-template-curly-in-string -- literal YAML text, not a template.
    expect(workflow).toContain('require(`${process.env.GITHUB_WORKSPACE}/scripts/ci/e2eReport.cjs`)');
  });

  it('should hand it the github-script bindings', () => {
    expect(workflow).toContain('await report({ github, context, core })');
  });
});
