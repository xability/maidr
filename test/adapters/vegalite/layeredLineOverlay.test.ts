/**
 * @jest-environment jsdom
 */

/**
 * A line drawn with points, inside a layered Vega-Lite chart, is highlighted.
 *
 * Vega-Lite compiles `mark: { type: 'line', point: true }` by turning the
 * line into a layer of its own, the line first and its points beside it. In
 * a layered chart that moves the line's marks one level down, from
 * `layer_1_marks` to `layer_1_layer_0_marks`, and nothing is named
 * `layer_1_marks` at all. The selector still named it, so py-maidr's Altair
 * bar + line chart (`alt.layer(bars, line.mark_line(point=True))`) never
 * highlighted its line, and MAIDR warned that the layer's selectors resolved
 * to nothing.
 */
import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { Maidr } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ROWS = [1, 2, 3].map(x => ({ x, bar_values: x * 2, line_values: x * 4 }));

/**
 * py-maidr's Altair bar + line chart, with the line's mark def given.
 * @param lineMark - The second layer's mark
 * @param lineEncoding - Channels added to the second layer's encoding
 * @returns The spec
 */
function barAndLine(lineMark: unknown, lineEncoding: Record<string, unknown> = {}): VegaLiteSpec {
  return {
    data: { values: ROWS },
    layer: [
      {
        mark: { type: 'bar' },
        encoding: {
          x: { field: 'x', type: 'ordinal', title: 'X values' },
          y: { field: 'bar_values', type: 'quantitative' },
        },
      },
      {
        mark: lineMark,
        encoding: {
          x: { field: 'x', type: 'ordinal' },
          y: { field: 'line_values', type: 'quantitative' },
          ...lineEncoding,
        },
      },
    ],
    resolve: { scale: { y: 'independent' } },
  } as unknown as VegaLiteSpec;
}

/**
 * The line layer's selectors.
 * @param maidr - The converted chart
 * @returns Its second layer's selectors
 */
function lineSelectors(maidr: Maidr): unknown {
  return maidr.subplots[0][0].layers[1].selectors;
}

describe('a layered vega-lite line drawn with points', () => {
  it('names the line where Vega-Lite moves it', () => {
    const maidr = vegaLiteToMaidr(barAndLine({ type: 'line', color: 'red', point: true }));

    // Before the fix: 'g.mark-line.role-mark.layer_1_marks > path'.
    expect(lineSelectors(maidr)).toEqual(['g.mark-line.role-mark.layer_1_layer_0_marks > path']);
  });

  it('resolves to the drawn line, not its points', () => {
    // What Vega renders for that layer: the line's group, then the points'.
    document.body.innerHTML = '';
    const svg = document.createElementNS(SVG_NS, 'svg');
    for (const [name, tag] of [
      ['mark-rect role-mark layer_0_marks', 'path'],
      ['mark-line role-mark layer_1_layer_0_marks', 'path'],
      ['mark-symbol role-mark layer_1_layer_1_marks', 'path'],
    ]) {
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('class', name);
      const mark = document.createElementNS(SVG_NS, tag);
      mark.setAttribute('id', name.split(' ')[2]);
      group.appendChild(mark);
      svg.appendChild(group);
    }
    document.body.appendChild(svg);
    const maidr = vegaLiteToMaidr(barAndLine({ type: 'line', point: true }));

    const [selector] = lineSelectors(maidr) as string[];

    expect(Array.from(document.querySelectorAll(selector)).map(el => el.id))
      .toEqual(['layer_1_layer_0_marks']);
  });

  it('follows a shape channel, which turns the points on when the mark leaves them unset', () => {
    const maidr = vegaLiteToMaidr(barAndLine({ type: 'line' }, { shape: { value: 'circle' } }));

    expect(lineSelectors(maidr)).toEqual(['g.mark-line.role-mark.layer_1_layer_0_marks > path']);
  });

  it('keeps the layer\'s own name when the points are turned off', () => {
    const maidr = vegaLiteToMaidr(barAndLine({ type: 'line', point: false }, { shape: { value: 'circle' } }));

    expect(lineSelectors(maidr)).toEqual(['g.mark-line.role-mark.layer_1_marks > path']);
  });

  it('keeps the layer\'s own name for a plain line', () => {
    const maidr = vegaLiteToMaidr(barAndLine('line'));

    expect(lineSelectors(maidr)).toEqual(['g.mark-line.role-mark.layer_1_marks > path']);
  });
});

describe('a single-view vega-lite line drawn with points', () => {
  it('still covers both names a single view can take', () => {
    const maidr = vegaLiteToMaidr({
      data: { values: ROWS },
      mark: { type: 'line', point: true },
      encoding: {
        x: { field: 'x', type: 'ordinal' },
        y: { field: 'line_values', type: 'quantitative' },
      },
    } as unknown as VegaLiteSpec);

    expect(maidr.subplots[0][0].layers[0].selectors).toEqual([
      'g.mark-line.role-mark.marks > path, g.mark-line.role-mark.layer_0_marks > path',
    ]);
  });
});
