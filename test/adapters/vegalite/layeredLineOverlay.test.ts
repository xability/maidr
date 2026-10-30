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
 * to nothing. A `config` that turns the points on for every line moves the
 * line the same way, so the selector names both groups rather than reading
 * the spec for which one the line is drawn under.
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
 * @returns The two layers
 */
function layers(lineMark: unknown): VegaLiteSpec[] {
  return [
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
      },
    },
  ] as unknown as VegaLiteSpec[];
}

/**
 * The bar + line chart as a layered spec.
 * @param lineMark - The second layer's mark
 * @param config - The chart's config
 * @returns The spec
 */
function barAndLine(lineMark: unknown, config?: Record<string, unknown>): VegaLiteSpec {
  return {
    data: { values: ROWS },
    layer: layers(lineMark),
    resolve: { scale: { y: 'independent' } },
    ...(config ? { config } : {}),
  } as unknown as VegaLiteSpec;
}

/**
 * The line layer's one selector.
 * @param maidr - The converted chart
 * @returns Its second layer's selector
 */
function lineSelector(maidr: Maidr): string {
  const selectors = maidr.subplots[0][0].layers[1].selectors as string[];
  expect(selectors).toHaveLength(1);
  return selectors[0];
}

/**
 * Draws the mark groups Vega renders, one path in each, the path named by
 * the group's own mark-group class.
 * @param groups - Each group's classes
 */
function draw(groups: string[]): void {
  document.body.innerHTML = '';
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const name of groups) {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', name);
    const mark = document.createElementNS(SVG_NS, 'path');
    mark.setAttribute('id', name.split(' ')[2]);
    group.appendChild(mark);
    svg.appendChild(group);
  }
  document.body.appendChild(svg);
}

/**
 * The paths a selector resolves to in the drawn chart.
 * @param selector - The selector
 * @returns The ids of the paths it matches, in document order
 */
function resolved(selector: string): string[] {
  return Array.from(document.querySelectorAll(selector)).map(el => el.id);
}

// What Vega renders for the bar layer and a line layer drawn with points:
// the line's group, then the points'.
const OVERLAID = [
  'mark-rect role-mark layer_0_marks',
  'mark-line role-mark layer_1_layer_0_marks',
  'mark-symbol role-mark layer_1_layer_1_marks',
];

describe('a layered vega-lite line drawn with points', () => {
  it('names both groups a layer can be drawn under', () => {
    const maidr = vegaLiteToMaidr(barAndLine({ type: 'line', color: 'red', point: true }));

    // Before the fix: 'g.mark-line.role-mark.layer_1_marks > path'.
    expect(lineSelector(maidr)).toBe(
      'g.mark-line.role-mark.layer_1_marks > path, g.mark-line.role-mark.layer_1_layer_0_marks > path',
    );
  });

  it('resolves to the drawn line, not its points', () => {
    draw(OVERLAID);
    const maidr = vegaLiteToMaidr(barAndLine({ type: 'line', point: true }));

    expect(resolved(lineSelector(maidr))).toEqual(['layer_1_layer_0_marks']);
  });

  it('resolves to the drawn line when the config turns the points on', () => {
    draw(OVERLAID);
    const maidr = vegaLiteToMaidr(barAndLine('line', { line: { point: true } }));

    expect(resolved(lineSelector(maidr))).toEqual(['layer_1_layer_0_marks']);
  });

  it('resolves to a line drawn without points once', () => {
    draw(['mark-rect role-mark layer_0_marks', 'mark-line role-mark layer_1_marks']);
    const maidr = vegaLiteToMaidr(barAndLine('line'));

    expect(resolved(lineSelector(maidr))).toEqual(['layer_1_marks']);
  });
});

describe('a layered vega-lite area drawn with a line along it', () => {
  it('resolves to the area, not the line drawn over it', () => {
    draw([
      'mark-rect role-mark layer_0_marks',
      'mark-area role-mark layer_1_layer_0_marks',
      'mark-line role-mark layer_1_layer_1_marks',
    ]);
    const maidr = vegaLiteToMaidr(barAndLine({ type: 'area', line: true }));

    expect(resolved(lineSelector(maidr))).toEqual(['layer_1_layer_0_marks']);
  });
});

describe('a layered vega-lite concat child with a line drawn with points', () => {
  it('resolves to the drawn line under the child\'s own names', () => {
    draw([
      'mark-rect role-mark concat_0_layer_0_marks',
      'mark-line role-mark concat_0_layer_1_layer_0_marks',
      'mark-symbol role-mark concat_0_layer_1_layer_1_marks',
    ]);
    const maidr = vegaLiteToMaidr({
      hconcat: [{ data: { values: ROWS }, layer: layers({ type: 'line', point: true }) }],
    } as unknown as VegaLiteSpec);

    expect(resolved(lineSelector(maidr))).toEqual(['concat_0_layer_1_layer_0_marks']);
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
