import { describe, expect, it } from '@jest/globals';
import { lintOutcomes } from './restrictedSyntax';

/**
 * One case for the `aria-label`-from-children rule, and its expectation.
 *
 * The chat link override used to build `Link: ${props.children}`, which is a
 * string only when the link text has no markup in it. Anything else — an
 * element for `[**bold**](url)`, an array for mixed content — stringifies to
 * `[object Object]`, and `aria-label` replaces the accessible name rather
 * than supplementing it, so the visible text is not a fallback.
 */
// Fixture text, not interpolations missing their backticks.
/* eslint-disable no-template-curly-in-string */
const CASES: readonly { code: string; flagged: boolean }[] = [
  { code: 'aria-label={`Link: ${props.children}`}', flagged: true },
  { code: 'aria-label={`Link: ${children}`}', flagged: true },
  { code: 'aria-label={String(props.children)}', flagged: true },
  // Passing an existing label through, and a literal one. Both are names
  // someone decided on, rather than a stringified React node.
  { code: 'aria-label={props[\'aria-label\']}', flagged: false },
  { code: 'aria-label="Back to reference 1"', flagged: false },
  { code: 'aria-label={label}', flagged: false },
];
/* eslint-enable no-template-curly-in-string */

describe('the aria-label lint rule', () => {
  it('should report a label built from children, and nothing else', () => {
    const { actual, expected } = lintOutcomes(CASES);

    expect(actual).toEqual(expected);
  });
});
