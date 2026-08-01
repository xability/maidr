import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { visuallyHidden } from '@ui/visuallyHidden';

const ROOT = resolve(__dirname, '../..');

/**
 * One case for the `sr-only` lint rule, and whether it should be reported.
 *
 * The forms are not hypothetical. Each is one the guard this rule replaced got
 * wrong at some point while it was a regex over source text — a hyphen next to
 * a word boundary, a template truncated at the first `}`, a brace inside a
 * string literal — and each failed by silently passing.
 */
// The `${...}` below are fixture text, not interpolations that lost their
// backticks — two of these cases exist precisely because a template
// interpolation is what used to break the guard.
/* eslint-disable no-template-curly-in-string */
const CASES: readonly { code: string; flagged: boolean }[] = [
  { code: 'className="sr-only"', flagged: true },
  { code: 'className={\'sr-only\'}', flagged: true },
  { code: 'className={`sr-only`}', flagged: true },
  { code: 'className={cond ? \'sr-only\' : undefined}', flagged: true },
  { code: 'className={`${cond} sr-only`}', flagged: true },
  { code: 'className={cond ? \'a{b\' : \'sr-only\'}', flagged: true },
  // Different classes that merely contain the text, and an expression with no
  // literal in it — which is the shape the `h2` override uses to read the
  // class rather than assign one.
  { code: 'className="not-sr-only"', flagged: false },
  { code: 'className={`${cond}-sr-only`}', flagged: false },
  { code: 'className={someVariable}', flagged: false },
];
/* eslint-enable no-template-curly-in-string */

/**
 * Lines that `no-restricted-syntax` reports, one case per line.
 *
 * Runs the repo's own ESLint config rather than reconstructing the rule, so
 * this cannot pass against a selector that differs from the one in force.
 * Piped through stdin so no fixture file has to exist under `src/`, where it
 * would be linted and type-checked on its own account.
 * @param source - The fixture to lint.
 * @returns The 1-based line numbers reported.
 */
function restrictedSyntaxLines(source: string): number[] {
  let output: string;
  try {
    output = execFileSync(
      join(ROOT, 'node_modules/.bin/eslint'),
      ['--stdin', '--stdin-filename', 'src/srOnlyFixture.tsx', '--format', 'json'],
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
    .filter(message => message.ruleId === 'no-restricted-syntax')
    .map(message => message.line);
}

describe('visuallyHidden', () => {
  it('should keep hidden content in the accessibility tree', () => {
    // The whole point, and the easiest thing to lose while "simplifying":
    // `display: none` and `visibility: hidden` are shorter, look equivalent,
    // and remove the element from the accessibility tree — which would mute
    // the live regions that use this rather than merely restyling them.
    expect(visuallyHidden.display).toBeUndefined();
    expect(visuallyHidden.visibility).toBeUndefined();

    expect(visuallyHidden.position).toBe('absolute');
    expect(visuallyHidden.overflow).toBe('hidden');
    // Both spellings. `clip` is deprecated in favour of `clipPath`, but it is
    // the one every engine still honours for this idiom, so dropping either
    // widens the set of browsers that render the element.
    expect(visuallyHidden.clip).toBe('rect(0, 0, 0, 0)');
    expect(visuallyHidden.clipPath).toBe('inset(50%)');
  });
});

describe('the sr-only lint rule', () => {
  it('should report the class however it is written, and nothing else', () => {
    const source = CASES.map(({ code }) => `export const x = () => <div ${code} />;`).join('\n');

    const reported = new Set(restrictedSyntaxLines(source));

    // Both directions in one assertion: a selector that matched everything
    // would pass a check for the flagged cases alone, and one that matched
    // nothing would pass a check for the ignored ones.
    const actual = CASES.map(({ code }, index) => `${code} -> ${reported.has(index + 1)}`);
    const expected = CASES.map(({ code, flagged }) => `${code} -> ${flagged}`);
    expect(actual).toEqual(expected);
  });
});
