import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from '@jest/globals';
// Named imports: these packages are real ES modules and expose no default.
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { generateNotes } from '@semantic-release/release-notes-generator';

/**
 * The `!` breaking marker has to reach the release, not just pass commitlint.
 *
 * `@commitlint/config-conventional` accepts `feat!:` because it is built on the
 * conventionalcommits parser. semantic-release, configured with no `preset`,
 * used the **angular** one, whose header pattern is
 * `/^(\w*)(?:\((.*)\))?: (.*)$/` — no `!`. A marked subject therefore failed to
 * parse: `type` came out null, no release rule matched, and the commit
 * contributed *nothing*. Not a wrong release — no release at all, and the same
 * commit vanished from the notes.
 *
 * The two halves of the pipeline disagreeing about one character is the whole
 * failure: it passes review and then silently does nothing, which is how a
 * breaking change ships unversioned. `.claude/rules/git-workflow.md` documented
 * `!` as working the entire time.
 *
 * These read the real `.releaserc.json` and run the real plugins, so they fail
 * if someone drops the `parserOpts` back out, upgrades to a preset that stops
 * honouring `!`, or adds a plugin that parses commits without them.
 */

// Jest runs from `rootDir`, so this is the repository root. `import.meta` is
// not usable here: this project's files are still compiled to CommonJS.
const ROOT = process.cwd();

interface PluginOptions {
  parserOpts?: { headerPattern?: string; breakingHeaderPattern?: string };
}

/** The options `.releaserc.json` gives one plugin. */
function optionsFor(name: string): PluginOptions {
  const rc = JSON.parse(
    readFileSync(join(ROOT, '.releaserc.json'), 'utf8'),
  ) as { plugins: (string | [string, PluginOptions])[] };

  const entry = rc.plugins.find(
    plugin => Array.isArray(plugin) && plugin[0] === name,
  );
  if (!Array.isArray(entry)) {
    throw new TypeError(
      `${name} is not configured with options in .releaserc.json. It parses `
      + 'commits, so it needs the parserOpts that let it see `!`.',
    );
  }
  return entry[1];
}

const context = {
  logger: { log: () => {}, error: () => {} },
  cwd: ROOT,
};

async function releaseType(message: string): Promise<string | null> {
  return analyzeCommits(optionsFor('@semantic-release/commit-analyzer'), {
    ...context,
    commits: [{ hash: 'a'.repeat(40), message, subject: message.split('\n')[0] }],
  }) as Promise<string | null>;
}

describe('the release config honours the breaking marker', () => {
  it.each([
    ['feat!: x', 'major'],
    ['fix!: x', 'major'],
    ['feat(scope)!: x', 'major'],
    ['fix(scope)!: x', 'major'],
  ])('%s releases a %s', async (message, expected) => {
    // Before the parserOpts these were all `null` -- no release whatsoever.
    await expect(releaseType(message)).resolves.toBe(expected);
  });

  it('still honours the footer, which was the only marker that worked', async () => {
    await expect(releaseType('fix: x\n\nBREAKING CHANGE: y')).resolves.toBe('major');
  });

  it.each([
    ['feat: x', 'minor'],
    ['fix: x', 'patch'],
    ['perf: x', 'patch'],
    ['docs: x', null],
    ['chore: x', null],
    ['refactor: x', null],
  ])('leaves %s releasing %s', async (message, expected) => {
    // Admitting `!` must not change what an unmarked commit does.
    await expect(releaseType(message)).resolves.toBe(expected);
  });
});

describe('the release notes see a breaking commit too', () => {
  it('lists a `!`-marked commit rather than dropping it', async () => {
    // A second, independent symptom: the notes generator parses commits with
    // its own copy of the options, so a `!` commit was omitted from the
    // changelog even in a release cut by some other commit.
    const notes = await generateNotes(
      optionsFor('@semantic-release/release-notes-generator'),
      {
        ...context,
        commits: [{
          hash: 'a'.repeat(40),
          message: 'feat!: a breaking thing',
          subject: 'feat!: a breaking thing',
        }],
        lastRelease: { version: '1.0.0', gitTag: 'v1.0.0' },
        nextRelease: { version: '2.0.0', gitTag: 'v2.0.0' },
        options: { repositoryUrl: 'https://github.com/xability/maidr' },
      },
    );

    expect(notes).toMatch(/a breaking thing/i);
  });
});
