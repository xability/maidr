import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');

/**
 * Lines that `no-restricted-syntax` reports for a fixture.
 *
 * Runs the repo's own ESLint config rather than reconstructing a rule with
 * `RuleTester`. A reconstruction can agree with itself while disagreeing with
 * the config in force, which is the failure these tests exist to exclude.
 * Piped through stdin so no fixture file has to exist under `src/`, where it
 * would be linted and type-checked on its own account.
 * @param source - The fixture to lint, one case per line.
 * @returns The 1-based line numbers reported.
 */
export function restrictedSyntaxLines(source: string): number[] {
  let output: string;
  try {
    output = execFileSync(
      join(ROOT, 'node_modules/.bin/eslint'),
      ['--stdin', '--stdin-filename', 'src/lintFixture.tsx', '--format', 'json'],
      { cwd: ROOT, input: source, encoding: 'utf8' },
    );
  } catch (error) {
    // Expected: the fixtures are written to produce errors, and eslint exits
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
    .filter(message => message.ruleId === 'no-restricted-syntax')
    .map(message => message.line);
}

/**
 * Asserts each case is reported or not, as declared.
 *
 * Compares the whole list in one go rather than case by case: a selector that
 * matched everything would satisfy a check of the flagged cases alone, and one
 * that matched nothing would satisfy a check of the ignored ones.
 * @param cases - Each JSX attribute to place on a `div`, and its expectation.
 * @returns Actual and expected labels, ready to compare.
 */
export function lintOutcomes(
  cases: readonly { code: string; flagged: boolean }[],
): { actual: string[]; expected: string[] } {
  const source = cases.map(({ code }) => `export const x = () => <div ${code} />;`).join('\n');
  const reported = new Set(restrictedSyntaxLines(source));

  return {
    actual: cases.map(({ code }, index) => `${code} -> ${reported.has(index + 1)}`),
    expected: cases.map(({ code, flagged }) => `${code} -> ${flagged}`),
  };
}
