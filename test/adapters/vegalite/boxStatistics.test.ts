/**
 * @jest-environment jsdom
 */

/**
 * A Vega-Lite box plot announces the statistics the chart draws.
 *
 * Vega-Lite compiles `mark: 'boxplot'` into several tables, and for the
 * default (Tukey) extent no one of them carries every statistic: the
 * joinaggregate stage holds the raw rows with only `lower_box_*` and
 * `upper_box_*`, while the median and the whisker ends sit in tables of their
 * own. A spec with inline data resolved to its raw `source_0` and was
 * computed from the values; Altair names its dataset, so there is no
 * `source_0`, the name guess landed on the joinaggregate table, and that was
 * read as if it held every statistic: every median 0, the whisker ends equal
 * to the quartiles, and every value outside the box an outlier.
 *
 * The outliers were then replaced at bind time by values interpolated from
 * the symbols' pixel positions and rounded to whole numbers, so iris'
 * outliers 1.0 and 1.1 were announced as 1 and 1.
 *
 * Datasets below are laid out the way vega-lite 5.23 compiles an Altair box
 * plot (measured on py-maidr's example_altair_box page):
 *
 *   data-<hash>  raw rows
 *   data_1       raw rows + lower_box_v, upper_box_v      (joinaggregate)
 *   data_2       the outlier rows
 *   data_3       lower_whisker_v, upper_whisker_v, lower_box_v, upper_box_v
 *   data_6       lower_box_v, upper_box_v, mid_box_v, min_v, max_v
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { BoxPoint, Maidr } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { initMaidrOnElement } from '@util/initMaidr';
import { bindVegaLite } from '../../../src/vegalite-entry';

jest.mock('@util/initMaidr', () => ({ initMaidrOnElement: jest.fn() }));
const initMock = initMaidrOnElement as unknown as jest.Mock;

// The converter warns on purpose when a box plot's rows hold nothing to read.
const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
afterAll(() => warn.mockRestore());

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Two groups with a fractional outlier each. By hand (linear interpolation
 * between closest ranks, which is what Vega's quartiles use):
 *
 *   a: 10 20 30 40 50 60 70 | 200.4    q1 27.5  median 45   q3 62.5
 *      fences -25 and 115, whiskers 10 and 70, upper outlier 200.4
 *   b: -10.3 | 5 6 7 8 9               q1 5.25  median 6.5  q3 7.75
 *      fences 1.5 and 11.5, whiskers 5 and 9, lower outlier -10.3
 */
const RAW = [
  ...[10, 20, 30, 40, 50, 60, 70, 200.4].map(v => ({ g: 'a', v })),
  ...[-10.3, 5, 6, 7, 8, 9].map(v => ({ g: 'b', v })),
];

const EXPECTED: BoxPoint[] = [
  { z: 'a', lowerOutliers: [], min: 10, q1: 27.5, q2: 45, q3: 62.5, max: 70, upperOutliers: [200.4] },
  { z: 'b', lowerOutliers: [-10.3], min: 5, q1: 5.25, q2: 6.5, q3: 7.75, max: 9, upperOutliers: [] },
];

const BOX = { a: { q1: 27.5, q3: 62.5 }, b: { q1: 5.25, q3: 7.75 } };

/** An Altair box plot: its data named rather than inline. */
const ALTAIR_SPEC = {
  data: { name: 'data-3a191f69' },
  mark: { type: 'boxplot' },
  encoding: {
    x: { field: 'g', type: 'nominal' },
    y: { field: 'v', type: 'quantitative' },
  },
} as unknown as VegaLiteSpec;

/**
 * A compiled view holding the tables vega-lite builds for that spec.
 * @param tables - Dataset name to rows
 * @returns The stub view
 */
function viewWith(tables: Record<string, Record<string, unknown>[]>): VegaView {
  return {
    data: (name: string) => {
      if (!(name in tables))
        throw new Error(`Unrecognized data set: ${name}`);
      return tables[name];
    },
    getState: () => ({ data: Object.fromEntries(Object.keys(tables).map(name => [name, {}])) }),
    scale: () => {
      throw new Error('no scales');
    },
  } as unknown as VegaView;
}

/** The tables of an Altair box plot of `RAW`. */
function altairTables(): Record<string, Record<string, unknown>[]> {
  const boxOf = (g: string): { q1: number; q3: number } => BOX[g as 'a' | 'b'];
  return {
    'data-3a191f69': RAW,
    'data_1': RAW.map(row => ({ ...row, lower_box_v: boxOf(row.g).q1, upper_box_v: boxOf(row.g).q3 })),
    'data_2': [{ g: 'a', v: 200.4 }, { g: 'b', v: -10.3 }],
    'data_3': EXPECTED.map(p => ({ g: p.z, lower_whisker_v: p.min, upper_whisker_v: p.max, lower_box_v: p.q1, upper_box_v: p.q3 })),
    'data_6': EXPECTED.map(p => ({ g: p.z, lower_box_v: p.q1, upper_box_v: p.q3, mid_box_v: p.q2, min_v: -10.3, max_v: 200.4 })),
  };
}

describe('a vega-lite box plot whose data is named, as Altair names it', () => {
  it('announces the median and the whisker ends the chart draws', () => {
    const maidr = vegaLiteToMaidr(ALTAIR_SPEC, viewWith(altairTables()));

    const boxes = maidr.subplots[0][0].layers[0].data as BoxPoint[];

    // Before the fix: q2 0, min = q1 and max = q3 for both boxes, and every
    // value outside the box an outlier.
    expect(boxes).toEqual(EXPECTED);
  });
});

describe('a vega-lite box plot whose rows hold neither every statistic nor the raw values', () => {
  beforeEach(() => {
    warn.mockClear();
  });

  it('says its boxes cannot be read from them', () => {
    // The whisker table: no median, no observations.
    const maidr = vegaLiteToMaidr(ALTAIR_SPEC, viewWith({ data_0: altairTables().data_3 }));

    expect(maidr.subplots[0][0].layers[0].type).toBe('box');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('neither every statistic of "v" nor its raw values'));
  });

  it('stays quiet when the rows hold the raw values', () => {
    vegaLiteToMaidr(ALTAIR_SPEC, viewWith(altairTables()));

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('a vega-lite box plot with a table carrying every statistic', () => {
  it('still reads that table as computed', () => {
    // `extent: 'min-max'` compiles to one table with all five columns.
    const full = [
      { g: 'a', lower_box_v: 27.5, upper_box_v: 62.5, mid_box_v: 45, lower_whisker_v: 10, upper_whisker_v: 200.4 },
    ];
    const spec = {
      ...ALTAIR_SPEC,
      mark: { type: 'boxplot', extent: 'min-max' },
    } as unknown as VegaLiteSpec;

    const maidr = vegaLiteToMaidr(spec, viewWith({ data_0: full }));

    expect(maidr.subplots[0][0].layers[0].data).toEqual([
      { z: 'a', lowerOutliers: [], min: 10, q1: 27.5, q2: 45, q3: 62.5, max: 200.4, upperOutliers: [] },
    ]);
  });
});

/** Pixel y of a value: a linear scale, 220 at 0, one pixel per unit. */
const y = (v: number): number => 220 - v;

/** Pixel x of a value, for a box plot drawn along x: 20 at 0, one per unit. */
const x = (v: number): number => 20 + v;

/** Where an element is drawn. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Append an SVG element with a stubbed layout.
 * @param parent - Where to append
 * @param tag    - The element's tag
 * @param box    - Its measured box
 * @param label  - Its aria-label, if any
 * @returns The element
 */
function drawn(
  parent: Element,
  tag: string,
  box: Box,
  label?: string,
): SVGGraphicsElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGGraphicsElement;
  if (label)
    el.setAttribute('aria-label', label);
  el.getBoundingClientRect = (): DOMRect => ({
    ...box,
    top: box.y,
    left: box.x,
    right: box.x + box.width,
    bottom: box.y + box.height,
  }) as DOMRect;
  parent.appendChild(el);
  return el;
}

/**
 * A mark group of the given classes, appended to the SVG.
 * @param svg     - The chart's SVG
 * @param classes - The group's classes
 * @returns The group
 */
function group(svg: Element, classes: string): Element {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', classes);
  svg.appendChild(g);
  return g;
}

/** How the box plot of `RAW` is drawn. */
interface Drawing {
  /** Boxes along x, one per row of the y axis, rather than up the y axis. */
  horizontal?: boolean;
  /** Symbols drawn above box a's upper whisker that its rows do not hold. */
  extraUpper?: number[];
}

/**
 * The box plot spec over `RAW`.
 * @param horizontal - Whether the values run along x
 * @returns The spec
 */
function boxSpec(horizontal = false): VegaLiteSpec {
  const value = { field: 'v', type: 'quantitative' };
  const category = { field: 'g', type: 'nominal' };
  return {
    data: { values: RAW },
    mark: 'boxplot',
    encoding: horizontal ? { x: value, y: category } : { x: category, y: value },
  } as unknown as VegaLiteSpec;
}

/**
 * The rendered box plot of `RAW`, drawn as vega-lite draws a boxplot: an
 * outlier group, two whisker groups, the boxes and the medians.
 * @param drawing - How it is drawn
 * @returns The view to bind
 */
function renderedBoxPlot(drawing: Drawing = {}): VegaView {
  const container = document.createElement('div');
  container.id = 'chart';
  const svg = document.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);
  document.body.appendChild(container);

  const symbols = group(svg, 'mark-symbol role-mark layer_0_layer_0_marks');
  const lowerRules = group(svg, 'mark-rule role-mark layer_0_layer_1_layer_0_marks');
  const upperRules = group(svg, 'mark-rule role-mark layer_0_layer_1_layer_1_marks');
  const boxes = group(svg, 'mark-rect role-mark layer_1_layer_0_marks');
  const medians = group(svg, 'mark-rect role-mark layer_1_layer_1_marks');

  for (const [i, p] of EXPECTED.entries()) {
    const across = 50 + i * 100;
    const outliers = [...p.lowerOutliers, ...p.upperOutliers, ...(i === 0 ? drawing.extraUpper ?? [] : [])];
    if (drawing.horizontal) {
      drawn(boxes, 'path', { x: x(p.q1), y: across - 10, width: p.q3 - p.q1, height: 20 }, `g: ${p.z}`);
      drawn(medians, 'path', { x: x(p.q2) - 0.5, y: across - 10, width: 1, height: 20 });
      drawn(lowerRules, 'line', { x: x(p.min), y: across, width: p.q1 - p.min, height: 0 });
      drawn(upperRules, 'line', { x: x(p.q3), y: across, width: p.max - p.q3, height: 0 });
      for (const v of outliers)
        drawn(symbols, 'path', { x: x(v) - 2.5, y: across - 2.5, width: 5, height: 5 });
      continue;
    }
    drawn(boxes, 'path', { x: across - 10, y: y(p.q3), width: 20, height: p.q3 - p.q1 }, `g: ${p.z}`);
    drawn(medians, 'path', { x: across - 10, y: y(p.q2) - 0.5, width: 20, height: 1 });
    drawn(lowerRules, 'line', { x: across, y: y(p.q1), width: 0, height: p.q1 - p.min });
    drawn(upperRules, 'line', { x: across, y: y(p.max), width: 0, height: p.max - p.q3 });
    for (const v of outliers)
      drawn(symbols, 'path', { x: across - 2.5, y: y(v) - 2.5, width: 5, height: 5 });
  }

  const view = {
    container: () => container,
    data: (name: string) => {
      throw new Error(`no dataset ${name}`);
    },
    runAsync: async (): Promise<unknown> => view,
    scale: () => undefined,
  } as unknown as VegaView;
  return view;
}

describe('binding a vega-lite box plot with fractional outliers', () => {
  beforeEach(() => {
    initMock.mockClear();
    document.body.innerHTML = '';
  });

  it('announces each outlier at its value, not rounded from where it is drawn', () => {
    bindVegaLite(renderedBoxPlot(), boxSpec());
    const maidr = initMock.mock.calls[0]?.[0] as Maidr;
    const boxes = maidr.subplots[0][0].layers[0].data as BoxPoint[];

    // Before the fix: [200] and [-10].
    expect(boxes.map(p => p.upperOutliers)).toEqual([[200.4], []]);
    expect(boxes.map(p => p.lowerOutliers)).toEqual([[], [-10.3]]);
  });

  it('still outlines each outlier it announces', () => {
    const view = renderedBoxPlot();
    bindVegaLite(view, boxSpec());
    const maidr = initMock.mock.calls[0]?.[0] as Maidr;
    const selectors = maidr.subplots[0][0].layers[0].selectors as Array<{ upperOutliers: string[]; lowerOutliers: string[] }>;
    const container = view.container() as HTMLElement;

    const upper = container.querySelector(selectors[0].upperOutliers[0]);
    const lower = container.querySelector(selectors[1].lowerOutliers[0]);
    expect(upper?.getBoundingClientRect().y).toBeCloseTo(y(200.4) - 2.5);
    expect(lower?.getBoundingClientRect().y).toBeCloseTo(y(-10.3) - 2.5);
  });

  it('announces them at their values when the boxes are drawn along x', () => {
    bindVegaLite(renderedBoxPlot({ horizontal: true }), boxSpec(true));
    const maidr = initMock.mock.calls[0]?.[0] as Maidr;
    const boxes = maidr.subplots[0][0].layers[0].data as BoxPoint[];

    expect(boxes.map(p => p.upperOutliers)).toEqual([[200.4], []]);
    expect(boxes.map(p => p.lowerOutliers)).toEqual([[], [-10.3]]);
  });

  it('keeps the drawn estimates when the rows hold a different number of outliers', () => {
    // A symbol the rows do not account for: no observed value can be said to
    // be that symbol's, so each keeps the value read off its position.
    bindVegaLite(renderedBoxPlot({ extraUpper: [150.6] }), boxSpec());
    const maidr = initMock.mock.calls[0]?.[0] as Maidr;
    const boxes = maidr.subplots[0][0].layers[0].data as BoxPoint[];

    expect(boxes[0].upperOutliers).toEqual([151, 200]);
  });
});
