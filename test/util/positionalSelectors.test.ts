/**
 * Resolving a positional selector list (#1004).
 *
 * `Svg.selectElement` does not only find an element: it inserts a hidden
 * clone straight after the one it matched. That is invisible to a selector
 * naming a class or an id, and fatal to one that counts siblings, because the
 * clone is a sibling the chart never drew.
 *
 * Measured before the fix, three `<path>` elements addressed by
 * `:nth-child(k)` and resolved one at a time:
 *
 *   ascending   1, 2, 3   →   p1   p1   p1
 *   descending  3, 2, 1   →   p3   p2   p1
 *
 * Ascending answers with the clone of the first element every time, and it
 * looks like a working highlight — a real bar of the chart, outlined, that
 * simply never moves. Descending survives because a clone inserted after
 * position k cannot disturb any position below k, which is a property of the
 * order a caller happens to emit in rather than of the selectors.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { Svg } from '@util/svg';
import { JSDOM } from 'jsdom';

const IDS = ['p1', 'p2', 'p3'];

function installDom(): void {
  const dom = new JSDOM(
    '<!doctype html><body><div id="c"><svg xmlns="http://www.w3.org/2000/svg">'
    + `<g class="grp">${IDS.map(id => `<path class="pt" id="${id}"/>`).join('')}</g>`
    + '</svg></div></body>',
  );
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.document = dom.window.document;
  globals.SVGElement = dom.window.SVGElement;
}

afterEach(() => {
  const globals = globalThis as unknown as Record<string, unknown>;
  delete globals.document;
  delete globals.SVGElement;
});

/** The selector naming the kth sibling, one-based as CSS counts. */
function nth(position: number): string {
  return `#c .grp .pt:nth-child(${position})`;
}

/** The ids a list of selectors resolves to, looked up before anything is inserted. */
function resolveAll(selectors: string[]): (string | undefined) [] {
  const found = selectors.map(one => Svg.selectElement(one, false));
  return found.map((element) => {
    if (element === null) {
      return undefined;
    }
    return (Svg.cloneHidden(element) as unknown as Element).id;
  });
}

describe('resolving a list of positional selectors', () => {
  it('answers with each named element when the list runs forwards', () => {
    installDom();

    expect(resolveAll([1, 2, 3].map(nth))).toEqual(IDS);
  });

  it('answers with each named element when the list runs backwards', () => {
    installDom();

    expect(resolveAll([3, 2, 1].map(nth))).toEqual([...IDS].reverse());
  });

  it('shows why: resolving one at a time moves the ones after it', () => {
    // Not a wish, a record. This is what the whole codebase does whenever it
    // resolves a selector, and it is why the lookups have to finish first.
    installDom();

    const oneAtATime = [1, 2, 3]
      .map(position => Svg.selectElement(nth(position)))
      .map(element => (element as unknown as Element | null)?.id);

    expect(oneAtATime).toEqual(['p1', 'p1', 'p1']);
  });
});
