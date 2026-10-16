/**
 * @jest-environment jsdom
 */

import { watchGraphviz } from '@adapters/graphviz/watch';
import { afterEach, describe, expect, it } from '@jest/globals';
import { pipeline, undirected } from './fixtures';

/**
 * watchGraphviz: the drawings a Quarto `{dot}` cell leaves in the page, and
 * the ones drawn into it later.
 */

/**
 * Lets the watcher's batched pass run.
 */
async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 50));
}

describe('watchGraphviz', () => {
  let stop: () => void = () => {};

  afterEach(() => {
    stop();
    document.body.innerHTML = '';
  });

  it('binds the drawings already in the page', () => {
    document.body.innerHTML = `<figure>${pipeline}</figure><figure>${undirected}</figure>`;

    stop = watchGraphviz();

    expect([...document.querySelectorAll('svg')].map(svg => svg.hasAttribute('maidr'))).toEqual([true, true]);
  });

  it('binds a drawing added later, and leaves other SVGs alone', async () => {
    stop = watchGraphviz();

    document.body.insertAdjacentHTML('beforeend', `<figure>${pipeline}</figure><svg id="icon"><circle r="1"></circle></svg>`);
    await settle();

    expect(document.querySelector('figure svg')?.hasAttribute('maidr')).toBe(true);
    expect(document.getElementById('icon')?.hasAttribute('maidr')).toBe(false);
  });

  it('keeps a drawing the page bound itself as the page bound it', () => {
    document.body.innerHTML = `<figure>${pipeline}</figure>`;
    const svg = document.querySelector('svg') as SVGSVGElement;
    svg.setAttribute('maidr', '{"id":"mine","subplots":[]}');

    stop = watchGraphviz();

    expect(svg.getAttribute('maidr')).toBe('{"id":"mine","subplots":[]}');
  });

  it('stops binding once stopped', async () => {
    stop = watchGraphviz();
    stop();

    document.body.insertAdjacentHTML('beforeend', `<figure>${pipeline}</figure>`);
    await settle();

    expect(document.querySelector('svg')?.hasAttribute('maidr')).toBe(false);
  });
});
