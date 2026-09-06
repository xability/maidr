/**
 * @jest-environment jsdom
 */

/**
 * What invalidates a cached client rectangle.
 *
 * The pointer path compares cached mark centres against live pointer
 * coordinates, and both are viewport-relative -- so a cache that outlives a
 * scroll sends the reader's pointer to where a mark used to be. These cases
 * fix the rule that says when a cache is dropped.
 */

import { describe, expect, jest, test } from '@jest/globals';
import { watchViewport } from '@util/viewport';

describe('watching for the viewport moving', () => {
  test('reports the page scrolling', () => {
    const onChange = jest.fn();
    const stop = watchViewport(onChange);

    window.dispatchEvent(new Event('scroll'));

    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  test('reports a scrolling container the chart sits in', () => {
    // A scroll event does not bubble, so a container scrolling is only ever
    // seen in the capture phase. A chart in a scrollable panel moves exactly
    // this way and the window never hears about it otherwise.
    const onChange = jest.fn();
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const stop = watchViewport(onChange);

    panel.dispatchEvent(new Event('scroll'));

    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  test('reports the window changing shape', () => {
    const onChange = jest.fn();
    const stop = watchViewport(onChange);

    window.dispatchEvent(new Event('resize'));

    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  test('stops reporting once the watch is released', () => {
    const onChange = jest.fn();
    const stop = watchViewport(onChange);

    stop();
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));

    expect(onChange).not.toHaveBeenCalled();
  });

  test('tolerates being released twice', () => {
    const stop = watchViewport(jest.fn());

    stop();

    expect(() => stop()).not.toThrow();
  });
});
