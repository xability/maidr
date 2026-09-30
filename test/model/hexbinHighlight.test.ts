/**
 * @jest-environment jsdom
 */
import type { HexbinPoint, MaidrLayer } from '@type/grammar';
import { afterEach, describe, expect, test } from '@jest/globals';
import { HexbinTrace } from '@model/hexbin';
import { TraceType } from '@type/grammar';

/**
 * A positional selector list outlines the bin each entry names (#1004).
 *
 * Each match used to be cloned beside its original as it was resolved, so
 * the clone of bin k became the `:nth-of-type` target of entry k + 1 and
 * every bin after the first outlined a copy of the first hexagon. The count
 * still fitted, so nothing declined the list.
 */
const DATA: HexbinPoint[][] = [
  [{ x: 0, y: 0, count: 3 }, { x: 2, y: 0, count: 9 }],
  [{ x: 1, y: 1, count: 5 }],
];

afterEach(() => {
  document.body.innerHTML = '';
});

describe('hexbin highlight mapping', () => {
  test('a positional selector list resolves each entry to its own bin', () => {
    document.body.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">'
      + '<path id="a" /><path id="b" /><path id="c" /></svg>';
    const layer: MaidrLayer = {
      id: 'test-hexbin-positional',
      type: TraceType.HEXBIN,
      axes: { x: { label: 'X' }, y: { label: 'Y' }, z: { label: 'Count' } },
      selectors: [1, 2, 3].map(n => `svg path:nth-of-type(${n})`),
      data: DATA,
    };

    const trace = new HexbinTrace(layer);

    expect(trace.getAllHighlightElements().map(element => element.id))
      .toEqual(['a', 'b', 'c']);
    trace.dispose();
  });
});
