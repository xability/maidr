/**
 * @jest-environment jsdom
 */

import { refer } from '@adapters/mermaid/read';
import { describe, expect, it } from '@jest/globals';

/**
 * How the Mermaid adapter names the element it pairs with a reading, once
 * MAIDR has started making hidden copies beside the elements it highlights.
 */
describe('refer', () => {
  it('reaches the element alone, not its copy inside a copy MAIDR made of a whole node', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    node.appendChild(dot);
    svg.appendChild(node);
    document.body.appendChild(svg);
    const selector = refer(dot);

    // A layer that pairs the whole node keeps a hidden copy of it, dot and
    // all, and marks only the copy itself as MAIDR's.
    const copy = node.cloneNode(true) as SVGGElement;
    copy.setAttribute('data-maidr-owned', '');
    svg.appendChild(copy);

    expect([...document.querySelectorAll(selector)]).toEqual([dot]);
  });
});
