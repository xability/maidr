import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';

const ROOT = resolve(__dirname, '../..');

/**
 * Import specifiers the model layer may not name, and near misses it may.
 *
 * The near misses are the point of the list. `@type/state` and `@util/stack`
 * contain the words the pattern looks for, and a rule written to catch
 * `@state/` by substring would take both down with it — model files import
 * `@type/state` constantly, so the guard would be reverted within a day.
 */
const CASES: readonly { specifier: string; flagged: boolean }[] = [
  { specifier: '@service/navigation', flagged: true },
  { specifier: '@state/store', flagged: true },
  { specifier: '@ui/visuallyHidden', flagged: true },
  { specifier: '../service/audio', flagged: true },
  { specifier: '../../src/service/audio', flagged: true },
  { specifier: 'hotkeys-js', flagged: true },
  { specifier: '@type/state', flagged: false },
  { specifier: '@util/stack', flagged: false },
  { specifier: './plot', flagged: false },
];

/**
 * Lines that `no-restricted-imports` reports for a fixture linted as a model file.
 *
 * Runs the repository's own ESLint config rather than reconstructing the rule
 * with `RuleTester`: a reconstruction can agree with itself while disagreeing
 * with the config in force, which is the failure this test exists to exclude.
 * Piped through stdin under a `src/model/` filename so the fixture picks up
 * the model-layer block without a file having to exist there.
 *
 * `test/ui/restrictedSyntax.ts` runs ESLint the same way for
 * `no-restricted-syntax`. It is not shared: that helper builds JSX attribute
 * fixtures on a `div` and filters a different rule, so the only common part
 * is the `execFileSync` call below.
 * @param source - The fixture to lint, one import per line.
 * @returns The 1-based line numbers reported.
 */
function restrictedImportLines(source: string): number[] {
  let output: string;
  try {
    output = execFileSync(
      join(ROOT, 'node_modules/.bin/eslint'),
      ['--stdin', '--stdin-filename', 'src/model/lintFixture.ts', '--format', 'json'],
      { cwd: ROOT, input: source, encoding: 'utf8' },
    );
  } catch (error) {
    // Expected: the fixture is written to produce errors, and eslint exits
    // non-zero when it finds any. The report is still on stdout — but only if
    // it ran at all, so an empty one means the process failed for some other
    // reason and must not be read as "nothing was reported".
    const { stdout } = error as { stdout?: string };
    if (!stdout) {
      throw error;
    }
    output = stdout;
  }

  const [result] = JSON.parse(output) as {
    messages: { line: number; ruleId: string | null }[];
  }[];

  return result.messages
    .filter(message => message.ruleId === 'no-restricted-imports')
    .map(message => message.line);
}

describe('the model layer boundary', () => {
  it('reports every forbidden import and leaves the permitted ones alone', () => {
    // One side-effect import per line, so a reported line names its case.
    // Compared as a whole list rather than case by case: a pattern matching
    // everything would satisfy a check of the flagged cases alone, and one
    // matching nothing would satisfy a check of the permitted ones.
    const source = CASES.map(({ specifier }) => `import '${specifier}';`).join('\n');

    const reported = new Set(restrictedImportLines(source));

    expect(CASES.map(({ specifier }, index) => `${specifier} -> ${reported.has(index + 1)}`))
      .toEqual(CASES.map(({ specifier, flagged }) => `${specifier} -> ${flagged}`));
  });

  it('leaves the same imports alone outside the model layer', () => {
    // Services are allowed to import each other and to drive hotkeys; the
    // block is scoped to `src/model/**`, not applied repo-wide.
    const source = CASES.map(({ specifier }) => `import '${specifier}';`).join('\n');

    let output: string;
    try {
      output = execFileSync(
        join(ROOT, 'node_modules/.bin/eslint'),
        ['--stdin', '--stdin-filename', 'src/service/lintFixture.ts', '--format', 'json'],
        { cwd: ROOT, input: source, encoding: 'utf8' },
      );
    } catch (error) {
      const { stdout } = error as { stdout?: string };
      if (!stdout) {
        throw error;
      }
      output = stdout;
    }
    const [result] = JSON.parse(output) as {
      messages: { ruleId: string | null }[];
    }[];

    expect(result.messages.filter(message => message.ruleId === 'no-restricted-imports')).toEqual([]);
  });
});
