import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

/**
 * Exercises the `github-script` body in the scheduled e2e workflow.
 *
 * That script cannot be run from a pull request — it only fires on
 * `schedule` — so until now it was verified by hand each time it changed.
 * A real bug got through that way: the first version of the close-on-green
 * step called `listForRepo` unpaginated, so "close every open failure issue"
 * silently meant "the first thirty".
 *
 * The script is read out of the YAML rather than duplicated here, so the
 * thing under test is the thing that runs. Octokit is stubbed, and the stub
 * caps an unpaginated `listForRepo` at 30 the way the real API does — that is
 * what makes the pagination case fail if the fix is ever reverted.
 *
 * The block is extracted textually rather than with a YAML parser: `js-yaml`
 * is only present transitively here, and a test that reaches for an
 * undeclared dependency breaks the day something upstream stops pulling it.
 */

interface StubIssue {
  number: number;
  title: string;
  labels: string[];
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
}

const ROOT = resolve(__dirname, '../..');
const WORKFLOW = join(ROOT, '.github/workflows/e2e_tests.yml');

/**
 * The github-script body from the report step, as it will run in CI.
 *
 * Takes everything indented past the `script: |` line, then removes that
 * indentation — which is what the YAML block scalar means.
 */
function reportScript(): string {
  const lines = readFileSync(WORKFLOW, 'utf8').split('\n');
  const start = lines.findIndex(line => /^\s*script: \|\s*$/.test(line));
  if (start === -1) {
    throw new Error(`No "script: |" block in ${WORKFLOW}`);
  }

  const indent = (lines[start].match(/^\s*/) ?? [''])[0].length + 2;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
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
async function runScript(status: string, open: StubIssue[]): Promise<RunResult> {
  const result: RunResult = {
    closed: [],
    commented: [],
    created: [],
    usedUnpaginatedList: false,
  };

  const matching = (labels: string[]): StubIssue[] =>
    open.filter(issue => issue.labels.includes(labels[0]));

  const github = {
    paginate: async (_fn: unknown, params: { labels: string[] }) => matching(params.labels),
    rest: {
      issues: {
        // The real API pages at 30; a caller that skips `paginate` sees no more.
        listForRepo: async (params: { labels: string[] }) => {
          result.usedUnpaginatedList = true;
          return { data: matching(params.labels).slice(0, 30) };
        },
        create: async (params: { labels: string[] }) => {
          result.created.push(params.labels);
        },
        createComment: async (params: { issue_number: number }) => {
          result.commented.push(params.issue_number);
        },
        update: async (params: { issue_number: number; state?: string }) => {
          if (params.state === 'closed') {
            result.closed.push(params.issue_number);
          }
        },
      },
    },
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
  const sandbox = {
    github,
    context,
    require,
    process: { env: { TEST_STATUS: status } },
    Date,
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
  });
});
