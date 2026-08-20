/**
 * The adapter's own summary of what it reads, checked against what it reads.
 *
 * `src/adapters/observable/index.ts` opens with a `@packageDocumentation` block
 * naming the marks the adapter handles, and that block is what a reader of the
 * generated API docs sees first. It drifted: five marks were added over #1069,
 * #1081, #1093, #1094, #1098 and #1100 without it moving, and it still said box
 * plots were skipped a release after they were read. Nothing failed, because
 * prose is not compiled.
 *
 * So compile it here. Every label `convertMark` dispatches has to be named in
 * the "Marks it reads" section, and so does the box plot — which is assembled
 * before the switch rather than dispatched by it, and is therefore exactly the
 * kind of reading a check on the switch alone would keep missing.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';

const ADAPTER = join(__dirname, '../../../src/adapters/observable');

function source(file: string): string {
  return readFileSync(join(ADAPTER, file), 'utf8');
}

/** The mark labels `convertMark`'s switch has a branch for. */
function dispatchedLabels(): string[] {
  const converters = source('converters.ts');
  const start = converters.indexOf('function convertMark(');
  expect(start).toBeGreaterThan(-1);

  const body = converters.slice(start, converters.indexOf('\n}', start));
  return [...body.matchAll(/case '([^']+)':/g)].map(([, label]) => label);
}

/**
 * The backticked names in the module documentation's "Marks it reads" section.
 *
 * Sliced to that section so a mark named only among the refusals below it does
 * not count as read — several are named in both, for opposite reasons.
 */
function namesRead(): string[] {
  const documentation = source('index.ts');
  const start = documentation.indexOf('### Marks it reads');
  const end = documentation.indexOf('### Marks it does not');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  const section = documentation.slice(start, end);
  return [...section.matchAll(/`([^`]+)`/g)]
    .map(([, name]) => name.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

/** Whether the prose names a mark: `linear-regression` is `linearRegressionY`. */
function isNamed(label: string, names: string[]): boolean {
  const wanted = label.toLowerCase().replace(/[^a-z0-9]/g, '');
  return names.some(name => name.startsWith(wanted));
}

describe('the observable adapter\'s documented mark list', () => {
  it('names every mark the converter dispatches', () => {
    const names = namesRead();
    const missing = dispatchedLabels().filter(label => !isNamed(label, names));

    expect(missing).toEqual([]);
  });

  it('is checking a list that is actually there', () => {
    // Both halves of the check read text, and text that moved out from under
    // the slice would leave the assertion above passing over nothing.
    expect(dispatchedLabels().length).toBeGreaterThanOrEqual(10);
    expect(namesRead().length).toBeGreaterThanOrEqual(10);
  });

  it('names the box plot, which is read without a branch of its own', () => {
    // `boxComposites` claims the four groups a box plot is drawn with before
    // the dispatch loop runs, so no `case 'box'` exists to be counted. The
    // documentation said box plots were skipped for a release after they were
    // read, and a check on the switch alone would not have noticed.
    expect(source('converters.ts')).toContain('TraceType.BOX');
    expect(isNamed('box', namesRead())).toBe(true);
  });
});
