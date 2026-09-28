import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

/**
 * A release that reaches npm but not r-maidr, py-maidr or maidr-skill files
 * an issue instead of passing unnoticed.
 *
 * The notify step in `release.yml` runs under `continue-on-error`, so a
 * release is never failed by a missed ping, and the run stays green. 4.11.0
 * is what that cost: the token then used could not dispatch to maidr-skill
 * (HTTP 403), r-maidr and py-maidr gave up before npm served the version, and
 * nothing said so until a maintainer went looking.
 *
 * `scripts/ci/releaseNotifyIssue.cjs` files the issue from what the notify
 * step reports: which failure, which repositories were not told, and why.
 * Octokit is stubbed. The last block reads `release.yml` and checks the other
 * half: that the step still runs the module, only when the notify step
 * failed, that each failure the module explains is one the step can report,
 * and that the module's list of receivers is the one the step pings.
 *
 * `require` rather than `import` for the reason `e2eReportWorkflow.test.ts`
 * gives: the module is `.cjs` and this file runs in Jest's CommonJS project.
 */

interface Issue {
  number: number;
  title: string;
  pull_request?: object;
}

interface Bindings {
  github: {
    paginate: (route: unknown, params: object) => Promise<Issue[]>;
    rest: {
      issues: {
        listForRepo: unknown;
        create: (params: { title: string; body: string; labels: string[] }) => Promise<{ data: { number: number } }>;
        createComment: (params: { issue_number: number; body: string }) => Promise<unknown>;
      };
    };
  };
  context: { repo: { owner: string; repo: string }; runId: number; serverUrl: string };
  core: { info: (message: string) => void };
}

const ROOT = resolve(__dirname, '../..');
const MODULE = join(ROOT, 'scripts/ci/releaseNotifyIssue.cjs');

// eslint-disable-next-line ts/no-require-imports -- CommonJS module; see the docblock.
const { notifyIssue, RECEIVERS } = require(MODULE) as {
  notifyIssue: (bindings: Bindings) => Promise<void>;
  RECEIVERS: string[];
};

const RUN = 'https://github.com/xability/maidr/actions/runs/123';

/** Octokit with `open` as the open issues, recording what the module files. */
function stub(open: Issue[] = []): {
  bindings: Bindings;
  created: Array<{ title: string; body: string; labels: string[] }>;
  comments: Array<{ issue_number: number; body: string }>;
} {
  const created: Array<{ title: string; body: string; labels: string[] }> = [];
  const comments: Array<{ issue_number: number; body: string }> = [];
  return {
    created,
    comments,
    bindings: {
      github: {
        paginate: async () => open,
        rest: {
          issues: {
            listForRepo: {},
            create: async (params) => {
              created.push(params);
              return { data: { number: 42 } };
            },
            createComment: async (params) => {
              comments.push(params);
              return {};
            },
          },
        },
      },
      context: { repo: { owner: 'xability', repo: 'maidr' }, runId: 123, serverUrl: 'https://github.com' },
      core: { info: () => {} },
    },
  };
}

const ENV = ['VERSION', 'FAILURE', 'MISSED', 'REASONS'] as const;
let saved: Partial<Record<(typeof ENV)[number], string>>;

/** What the notify step hands the module, through the environment. */
function report(values: Partial<Record<(typeof ENV)[number], string>>): void {
  for (const name of ENV)
    delete process.env[name];
  Object.assign(process.env, { VERSION: '4.12.0', ...values });
}

beforeEach(() => {
  saved = Object.fromEntries(ENV.map(name => [name, process.env[name]]));
});

afterEach(() => {
  for (const name of ENV) {
    if (saved[name] === undefined)
      delete process.env[name];
    else
      process.env[name] = saved[name];
  }
});

describe('notifyIssue', () => {
  it('should name every receiver and the app when no token could be minted', async () => {
    report({ FAILURE: 'token' });
    const s = stub();

    await notifyIssue(s.bindings);

    expect(s.created).toHaveLength(1);
    const [issue] = s.created;
    expect(issue.title).toBe('release: v4.12.0 did not reach the downstream repositories');
    expect(issue.labels).toEqual(['devops', 'automated']);
    expect(issue.body).toContain('maidr-release-dispatch');
    expect(issue.body).toContain('DOWNSTREAM_APP_PRIVATE_KEY');
    expect(issue.body).toContain(RUN);
    for (const repo of ['xability/r-maidr', 'xability/py-maidr', 'xability/maidr-skill'])
      expect(issue.body).toContain(repo);
    expect(issue.body).toContain('for repo in xability/r-maidr xability/py-maidr xability/maidr-skill; do');
    expect(issue.body).toContain('client_payload[version]=4.12.0');
  });

  it('should point at npm when the registry never served the version', async () => {
    report({ FAILURE: 'registry' });
    const s = stub();

    await notifyIssue(s.bindings);

    expect(s.created[0].body).toContain('https://www.npmjs.com/package/maidr/v/4.12.0');
    expect(s.created[0].body).toContain('for repo in xability/r-maidr xability/py-maidr xability/maidr-skill; do');
  });

  it('should name only the receivers that refused, with the reason GitHub gave', async () => {
    report({
      FAILURE: 'dispatch',
      MISSED: 'xability/maidr-skill',
      REASONS: 'xability/maidr-skill: gh: Resource not accessible by integration (HTTP 403)',
    });
    const s = stub();

    await notifyIssue(s.bindings);

    const { body } = s.created[0];
    expect(body).toContain('gh: Resource not accessible by integration (HTTP 403)');
    expect(body).toContain('for repo in xability/maidr-skill; do');
    expect(body).not.toContain('for repo in xability/r-maidr');
  });

  it('should still file an issue when the step failed without saying why', async () => {
    report({});
    const s = stub();

    await notifyIssue(s.bindings);

    expect(s.created).toHaveLength(1);
    expect(s.created[0].body).toContain(RUN);
    expect(s.created[0].body).toContain('for repo in xability/r-maidr xability/py-maidr xability/maidr-skill; do');
  });

  it('should call a failed notify step that named no repository unexplained, not blame a dispatch', async () => {
    report({ FAILURE: 'dispatch', MISSED: '' });
    const s = stub();

    await notifyIssue(s.bindings);

    expect(s.created[0].body).not.toContain('GitHub refused the dispatch');
    expect(s.created[0].body).toContain('for repo in xability/r-maidr xability/py-maidr xability/maidr-skill; do');
  });

  it('should comment on the open issue for the same version instead of filing another', async () => {
    report({ FAILURE: 'registry' });
    const s = stub([{ number: 7, title: 'release: v4.12.0 did not reach the downstream repositories' }]);

    await notifyIssue(s.bindings);

    expect(s.created).toHaveLength(0);
    expect(s.comments).toHaveLength(1);
    expect(s.comments[0].issue_number).toBe(7);
    expect(s.comments[0].body).toContain(RUN);
  });

  it('should not mistake a pull request or another version\'s issue for this one', async () => {
    report({ FAILURE: 'registry' });
    const s = stub([
      { number: 7, title: 'release: v4.12.0 did not reach the downstream repositories', pull_request: {} },
      { number: 8, title: 'release: v4.11.0 did not reach the downstream repositories' },
    ]);

    await notifyIssue(s.bindings);

    expect(s.comments).toHaveLength(0);
    expect(s.created).toHaveLength(1);
  });
});

/**
 * The seam between the module and `release.yml`, as in
 * `e2eReportWorkflow.test.ts`: every case above passes whether or not the
 * workflow still calls the module. This reads the raw YAML.
 */
describe('the release workflow', () => {
  const workflow = readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf8');
  const lines = workflow.split('\n').map(line => line.trim());

  it('should mint the dispatch token from the GitHub App, not a personal token', () => {
    expect(workflow).not.toContain('DOWNSTREAM_DISPATCH_TOKEN');
    expect(lines).toContain('uses: actions/create-github-app-token@v3');
    // eslint-disable-next-line no-template-curly-in-string -- literal YAML text, not a template.
    expect(lines).toContain('client-id: ${{ vars.DOWNSTREAM_APP_CLIENT_ID }}');
    // eslint-disable-next-line no-template-curly-in-string -- literal YAML text, not a template.
    expect(lines).toContain('private-key: ${{ secrets.DOWNSTREAM_APP_PRIVATE_KEY }}');
    // eslint-disable-next-line no-template-curly-in-string -- literal YAML text, not a template.
    expect(lines).toContain('GH_TOKEN: ${{ steps.dispatch-token.outputs.token }}');
  });

  it('should scope the token to exactly the repositories it pings', () => {
    const scoped = lines.find(line => line.startsWith('repositories: '));
    expect(scoped?.slice('repositories: '.length).split(',').map(name => `xability/${name}`)).toEqual(RECEIVERS);
    expect(lines).toContain(`for repo in ${RECEIVERS.join(' ')}; do`);
  });

  // An installation token lives an hour, and the registry wait can take one,
  // so a token minted before the wait could expire before the dispatch.
  it('should mint the token only once the registry serves the release', () => {
    expect(lines).toContain('if: steps.registry.outcome == \'success\'');
    expect(lines.indexOf('id: registry')).toBeLessThan(lines.indexOf('id: dispatch-token'));
    expect(lines.indexOf('id: dispatch-token')).toBeLessThan(lines.indexOf('id: notify'));
  });

  it('should file the issue when any of the three steps failed, and only then', () => {
    const at = lines.indexOf('if: steps.registry.outcome == \'failure\' || steps.dispatch-token.outcome == \'failure\' || steps.notify.outcome == \'failure\'');
    expect(at).toBeGreaterThan(lines.indexOf('id: notify'));
    // eslint-disable-next-line no-template-curly-in-string -- literal YAML text, not a template.
    expect(lines).toContain('const { notifyIssue } = require(`${process.env.GITHUB_WORKSPACE}/scripts/ci/releaseNotifyIssue.cjs`);');
    expect(lines).toContain('await notifyIssue({ github, context, core });');
  });

  it('should name the failure with one of the kinds the module explains', () => {
    // eslint-disable-next-line no-template-curly-in-string -- literal YAML text, not a template.
    expect(lines).toContain('FAILURE: ${{ steps.registry.outcome == \'failure\' && \'registry\' || steps.dispatch-token.outcome == \'failure\' && \'token\' || \'dispatch\' }}');
    // eslint-disable-next-line no-template-curly-in-string -- literal YAML text, not a template.
    expect(lines).toContain('MISSED: ${{ steps.notify.outputs.missed }}');
    // eslint-disable-next-line no-template-curly-in-string -- literal YAML text, not a template.
    expect(lines).toContain('REASONS: ${{ steps.notify.outputs.reasons }}');
  });
});
