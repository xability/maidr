/**
 * @jest-environment jsdom
 */

/**
 * The selector lists producers emitted before 4.0 keep their highlight.
 *
 * Until 4.0 a flat list that reached a model reading one selector string went
 * to `querySelectorAll` as it was, and the DOM joined it into a selector list:
 * `["#bars rect"]` worked as `"#bars rect"`. r-maidr emitted its bar, point,
 * pie, heat map and segmented selectors that way, and every py-maidr release up
 * to 1.24 still emits its scatter selector that way. 4.0 read those lists as
 * nothing (#750) or, for bars, as one selector per bar (#991), and the layer
 * kept announcing every point with nothing outlined. py-maidr loads the latest
 * maidr.js by default, so every installed copy lost its scatter highlight at
 * once, with nothing in the console to say why.
 *
 * These pin the restored meaning -- a flat list of strings is the one selector
 * list it stood for -- and that the producer is told, once, to emit a string.
 */

import type { MaidrLayer } from '@type/grammar';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';
import { resetSelectorWarnings } from '@util/selectors';

const SVG_NS = 'http://www.w3.org/2000/svg';

// jsdom defines no per-tag SVG interfaces; the models branch on a few of them.
// Answer by tag, as a browser would.
for (const [name, tag] of [['SVGPathElement', 'path'], ['SVGImageElement', 'image'], ['SVGRectElement', 'rect']]) {
  const scope = globalThis as unknown as Record<string, unknown>;
  if (scope[name] === undefined) {
    scope[name] = class {
      public static [Symbol.hasInstance](value: unknown): boolean {
        return (value as Element | null)?.tagName === tag;
      }
    };
  }
}

let warn: jest.SpiedFunction<typeof console.warn>;

beforeEach(() => {
  resetSelectorWarnings();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  document.body.innerHTML = '';
});

/** Every console warning so far, as text. */
function warnings(): string[] {
  return warn.mock.calls.map(call => String(call[0]));
}

/**
 * Draws a group of marks.
 * @param id - The group's id
 * @param tag - The element each mark is drawn as
 * @param names - One `data-name` per mark, in drawn order
 */
function draw(id: string, tag: string, names: string[]): void {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('id', id);
  names.forEach((name, i) => {
    const mark = document.createElementNS(SVG_NS, tag);
    mark.setAttribute('data-name', name);
    mark.setAttribute('x', String(10 * (i + 1)));
    mark.setAttribute('y', String(10 * (i + 1)));
    mark.setAttribute('cx', String(10 * (i + 1)));
    mark.setAttribute('cy', String(10 * (i + 1)));
    group.appendChild(mark);
  });
  svg.appendChild(group);
  document.body.appendChild(svg);
}

/** The `data-name` of every element a trace would outline, in its own order. */
function outlined(layer: MaidrLayer): string[] {
  return TraceFactory.create(layer)
    .getAllHighlightElements()
    .map(element => element.getAttribute('data-name') ?? '');
}

describe('a flat list written for maidr.js before 4.0', () => {
  it('names every bar of a bar layer when it is not one entry per bar', () => {
    draw('bars', 'rect', ['a', 'b', 'c']);
    const layer = {
      id: 'bars',
      type: TraceType.BAR,
      orientation: Orientation.VERTICAL,
      axes: {},
      // Two selectors for three bars: the shape of a producer that named its
      // bars in two groups, which 4.4 declined outright.
      selectors: ['#bars rect:nth-child(1)', '#bars rect:nth-child(n+2)'],
      data: [{ x: 'a', y: 1 }, { x: 'b', y: 2 }, { x: 'c', y: 3 }],
    } as unknown as MaidrLayer;

    expect(outlined(layer)).toEqual(['a', 'b', 'c']);
    expect(warnings().join('\n')).toMatch(/list of 2 selector strings/);
  });

  it('names the points of a scatter layer', () => {
    // The one-element list every py-maidr release up to 1.24 emits.
    draw('points', 'circle', ['p', 'q', 'r']);
    const layer = {
      id: 'points',
      type: TraceType.SCATTER,
      axes: {},
      selectors: ['#points circle'],
      data: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }],
    } as unknown as MaidrLayer;

    expect(outlined(layer).sort()).toEqual(['p', 'q', 'r']);
    expect(warnings().join('\n')).toMatch(/list of 1 selector string,/);
  });

  it('names the slices of a pie', () => {
    draw('pie', 'path', ['x', 'y', 'z']);
    const layer = {
      id: 'pie',
      type: TraceType.PIE,
      axes: {},
      selectors: ['#pie path'],
      data: [{ x: 'x', y: 1 }, { x: 'y', y: 2 }, { x: 'z', y: 3 }],
    } as unknown as MaidrLayer;

    expect(outlined(layer)).toEqual(['x', 'y', 'z']);
  });

  it('names the cells of a heat map instead of failing as a grid', () => {
    draw('heat', 'rect', ['c1', 'c2', 'c3', 'c4']);
    const layer = {
      id: 'heat',
      type: TraceType.HEATMAP,
      axes: {},
      selectors: ['#heat rect'],
      data: { x: ['a', 'b'], y: ['r1', 'r2'], points: [[1, 2], [3, 4]] },
    } as unknown as MaidrLayer;

    expect(outlined(layer)).toHaveLength(4);
  });

  it('walks a segmented <rect> layer category by category, as before #1135', () => {
    // Drawn the way ggplot2 and `barplot()` draw a stack: each category's
    // segments together, the last series first. A layer that arrives as a
    // list was written against that default; pairing it series by series
    // would outline a bar other than the one announced.
    draw('stack', 'rect', ['a-B', 'a-A', 'b-B', 'b-A', 'c-B', 'c-A']);
    const layer = {
      id: 'stack',
      type: TraceType.STACKED,
      orientation: Orientation.VERTICAL,
      axes: {},
      selectors: ['#stack rect'],
      data: [
        [{ x: 'a', y: 1, fill: 'A' }, { x: 'b', y: 2, fill: 'A' }, { x: 'c', y: 3, fill: 'A' }],
        [{ x: 'a', y: 4, fill: 'B' }, { x: 'b', y: 5, fill: 'B' }, { x: 'c', y: 6, fill: 'B' }],
      ],
    } as unknown as MaidrLayer;

    const trace = TraceFactory.create(layer) as unknown as { highlightValues: SVGElement[][] };

    expect(trace.highlightValues[0].map(e => e.getAttribute('data-name')))
      .toEqual(['a-A', 'b-A', 'c-A']);
    expect(trace.highlightValues[1].map(e => e.getAttribute('data-name')))
      .toEqual(['a-B', 'b-B', 'c-B']);
  });

  it('leaves a segmented string on today\'s series-by-series default', () => {
    // Only the list shape carries the old default; a string is read as today.
    draw('stack', 'rect', ['a-A', 'b-A', 'c-A', 'a-B', 'b-B', 'c-B']);
    const layer = {
      id: 'stack',
      type: TraceType.STACKED,
      orientation: Orientation.VERTICAL,
      axes: {},
      selectors: '#stack rect',
      data: [
        [{ x: 'a', y: 1, fill: 'A' }, { x: 'b', y: 2, fill: 'A' }, { x: 'c', y: 3, fill: 'A' }],
        [{ x: 'a', y: 4, fill: 'B' }, { x: 'b', y: 5, fill: 'B' }, { x: 'c', y: 6, fill: 'B' }],
      ],
    } as unknown as MaidrLayer;

    const trace = TraceFactory.create(layer) as unknown as { highlightValues: SVGElement[][] };

    expect(trace.highlightValues[0].map(e => e.getAttribute('data-name')))
      .toEqual(['a-A', 'b-A', 'c-A']);
    expect(warnings()).toEqual([]);
  });

  it('still reads a list with one entry per bar as one bar each', () => {
    // #991's meaning is untouched: the list is in the chart's reading order,
    // not the DOM's.
    draw('bars', 'rect', ['a', 'b', 'c']);
    const layer = {
      id: 'bars',
      type: TraceType.BAR,
      orientation: Orientation.VERTICAL,
      axes: {},
      selectors: ['#bars rect[data-name="c"]', '#bars rect[data-name="a"]', '#bars rect[data-name="b"]'],
      data: [{ x: 'c', y: 3 }, { x: 'a', y: 1 }, { x: 'b', y: 2 }],
    } as unknown as MaidrLayer;

    expect(outlined(layer)).toEqual(['c', 'a', 'b']);
    expect(warnings()).toEqual([]);
  });

  it('still declines an empty list, which is what #750 guarded against', () => {
    draw('bars', 'rect', ['a']);
    const layer = {
      id: 'bars',
      type: TraceType.BAR,
      orientation: Orientation.VERTICAL,
      axes: {},
      selectors: [],
      data: [{ x: 'a', y: 1 }],
    } as unknown as MaidrLayer;

    expect(outlined(layer)).toEqual([]);
    // An empty list says "nothing to name", so it is not reported either.
    expect(warnings()).toEqual([]);
  });
});
