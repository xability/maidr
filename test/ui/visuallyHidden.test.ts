import { describe, expect, it } from '@jest/globals';
import { visuallyHidden } from '@ui/visuallyHidden';
import { lintOutcomes } from './restrictedSyntax';

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
    const { actual, expected } = lintOutcomes(CASES);

    expect(actual).toEqual(expected);
  });
});
