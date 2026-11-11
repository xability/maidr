/**
 * @jest-environment jsdom
 */

/**
 * Where MAIDR puts the copies it makes of a chart's marks.
 *
 * Every copy goes straight after the element it is made from, unless a
 * placement an adapter registered claims its mark: then it goes where that
 * placement says, and the mark is recorded, since the copy is no longer the
 * next sibling it would otherwise be paired by.
 */

import { describe, expect, it } from '@jest/globals';
import { insertCopy, markOfPlacedCopy, placeCopiesWith } from '@util/copyPlacement';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Places copies of a mark in a `g.placed` group after the group holding it. */
placeCopiesWith((mark) => {
  const group = mark.closest('g.claimed');
  return group?.parentElement ? { parent: group.parentElement, before: null } : null;
});

/**
 * Draws a chart.
 * @param markup - Its content
 * @returns The chart
 */
function draw(markup: string): SVGSVGElement {
  document.body.innerHTML = `<svg xmlns="${SVG_NS}">${markup}</svg>`;
  return document.querySelector('svg') as SVGSVGElement;
}

/**
 * Copies an element, as the highlight does.
 * @param element - The element
 * @returns Its copy, not yet in the document
 */
function copyOf(element: Element): Element {
  const copy = element.cloneNode(true) as Element;
  copy.removeAttribute('id');
  copy.setAttribute('data-copy', element.id || 'copy');
  return copy;
}

describe('insertCopy', () => {
  it('puts a copy no placement claims straight after the element it was made from', () => {
    draw('<g><rect id="a"/><rect id="b"/></g>');
    const mark = document.getElementById('a') as Element;
    const copy = copyOf(mark);

    insertCopy(mark, copy);

    expect(mark.nextElementSibling).toBe(copy);
    expect(markOfPlacedCopy(copy)).toBeNull();
  });

  it('puts a copy a placement claims where it says, and records its mark', () => {
    const svg = draw('<g id="layer"><g class="claimed"><rect id="a"/><rect id="b"/></g></g>');
    const mark = document.getElementById('a') as Element;
    const copy = copyOf(mark);

    insertCopy(mark, copy);

    expect(svg.querySelector('#layer')?.lastElementChild).toBe(copy);
    expect(mark.nextElementSibling?.id).toBe('b');
    expect(markOfPlacedCopy(copy)).toBe(mark);
  });

  it('asks the placement about the mark when copying a copy of it', () => {
    const svg = draw('<g id="layer"><g class="claimed"><rect id="a"/></g></g>');
    const mark = document.getElementById('a') as Element;
    const hidden = copyOf(mark);
    insertCopy(mark, hidden);
    const highlight = copyOf(hidden);

    insertCopy(hidden, highlight);

    // The copy sits outside the claimed group, but is placed for the mark.
    expect(svg.querySelector('#layer')?.lastElementChild).toBe(highlight);
    expect(markOfPlacedCopy(highlight)).toBe(mark);
  });
});
