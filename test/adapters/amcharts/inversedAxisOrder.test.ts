/**
 * Which end of an inversed axis an amCharts bar, line, area or step is read
 * from (#1037).
 *
 * amCharts hands `series.dataItems` over in the axis' declared order whichever
 * way the axis is drawn, so a series laid along a renderer with
 * `inversed: true` is drawn from the far end while the adapter read it from
 * the near one. Measured on amCharts 5 bundled with esbuild and rendered in
 * Chromium, four categories `A,B,C,D`, taking each column's `left` from the
 * overlay rect the binder actually outlines with:
 *
 *   column, plain x            left  68 → 201 → 334 → 467   rightwards
 *   column, inversed x         left 467 → 334 → 201 →  68   leftwards
 *   horizontal bar, plain y    top  208 → 147 →  86 →  25   up from the bottom
 *   horizontal bar, inversed y top   25 →  86 → 147 → 208   down from the top
 *   line/area/step, inversed x left 506 → 373 → 240 → 107   leftwards
 *   line, inversed *value* y   left 107 → 240 → 373 → 506   rightwards
 *
 * The last line is the control that fixes the predicate: an inversed value
 * axis is how a bump chart puts first place at the top, and it moves nothing
 * about the order the categories are laid out in.
 *
 * Both halves are asserted together. amCharts paints to canvas and emits no
 * selectors, so the binder's overlay is the whole highlight and it resolves
 * through `navmap.ts` — reversing the payload without reversing the resolver's
 * item list would trade a correct highlight for a wrong one (#1024).
 */
import type { AmXYSeries } from '@adapters/amcharts/types';
import type { BarPoint, LinePoint, MaidrLayer, SegmentedPoint } from '@type/grammar';
import { fromXYChart } from '@adapters/amcharts/adapter';
import { buildNavigationMap, groupSeries } from '@adapters/amcharts/navmap';
import { describe, expect, it } from '@jest/globals';
import { fakeChart, fakeContainerEl, fakeSeries, itemOf } from './helpers';

const CATEGORIES = ['A', 'B', 'C', 'D'];
const VALUES = [10, 40, 20, 30];

/** An axis whose renderer answers the one setting the adapter reads. */
function axis(inversed: boolean): unknown {
  const renderer = {
    get: (key: string) => (key === 'inversed' ? inversed : undefined),
  };
  return { get: (key: string) => (key === 'renderer' ? renderer : undefined) };
}

interface SeriesOptions {
  className?: string;
  /** Whether the axis the marks run along is inversed. */
  alongInversed?: boolean;
  /** Whether the *value* axis is inversed — a bump chart's rank axis. */
  valueInversed?: boolean;
  /** Draw the categories down the page instead of across it. */
  horizontal?: boolean;
  /** Values to use instead of the default four. */
  values?: (number | null)[];
  /** Make the line's fill visible, which is how amCharts draws an area. */
  filled?: boolean;
  /** Stack this series on the previous one. */
  stacked?: boolean;
  name?: string;
}

/** A category-bound series whose items arrive in amCharts' own order. */
function seriesFor(options: SeriesOptions = {}): AmXYSeries {
  const horizontal = options.horizontal === true;
  const values = options.values ?? VALUES;
  const alongAxis = axis(options.alongInversed === true);
  const valueAxis = axis(options.valueInversed === true);

  const series = fakeSeries({
    className: options.className ?? 'ColumnSeries',
    name: options.name ?? 'S',
    settings: {
      ...(horizontal ? { categoryYField: 'category' } : { categoryXField: 'category' }),
      xAxis: horizontal ? valueAxis : alongAxis,
      yAxis: horizontal ? alongAxis : valueAxis,
      ...(options.stacked ? { stacked: true } : {}),
    },
    data: CATEGORIES.map((category, at) => (horizontal
      ? { categoryY: category, valueX: values[at] }
      : { categoryX: category, valueY: values[at] })),
  });

  // An area is a line whose fill template amCharts has been told to paint --
  // the same shape `fakeAreaSeries` builds, set here so one options object
  // covers every family this file measures.
  if (options.filled === true) {
    (series as unknown as Record<string, unknown>).fills = {
      template: { get: (key: string) => (key === 'fillOpacity' ? 0.5 : undefined) },
    };
  }
  return series;
}

interface Read {
  /** The categories the layer's payload names, in payload order. */
  payload: (string | number)[];
  /** The category the overlay would outline, column by column. */
  highlight: (string | number)[];
  layer: MaidrLayer;
}

/**
 * Read one layer's payload and the resolver's answer for the same columns.
 * @param seriesList - The chart's series
 * @param horizontal - Whether the categories run down the page
 * @returns Both halves, so a test can compare them
 */
function read(seriesList: AmXYSeries[], horizontal = false): Read {
  const chart = fakeChart({ series: seriesList });
  const containerEl = fakeContainerEl();
  const maidr = fromXYChart(chart, containerEl);
  const layers = maidr.subplots[0][0].layers;
  const layer = layers[0];
  const navMap = buildNavigationMap([{ chart, layers, groups: groupSeries(chart) }]);

  const rows = layer.data as unknown[];
  const first = Array.isArray(rows[0]) ? (rows[0] as unknown[]) : rows;
  const payload = first.map((point) => {
    const mark = point as BarPoint & LinePoint & SegmentedPoint;
    return horizontal ? (mark.y as string | number) : (mark.x as string | number);
  });

  const highlight = first.map((_, col) => {
    const targets = navMap.resolve(layer.id, 0, col);
    if (targets.length === 0) {
      return '';
    }
    const item = itemOf(targets[0]);
    return (item.get(horizontal ? 'categoryY' : 'categoryX')) as string | number;
  });

  return { payload, highlight, layer };
}

describe('amCharts inversed axis reading order', () => {
  it('reads a plain column chart in the order its items arrive', () => {
    const { payload, highlight } = read([seriesFor()]);
    expect(payload).toEqual(CATEGORIES);
    expect(highlight).toEqual(CATEGORIES);
  });

  it('reads a column chart on an inversed x axis from the left of the screen', () => {
    const { payload, highlight } = read([seriesFor({ alongInversed: true })]);
    expect(payload).toEqual(['D', 'C', 'B', 'A']);
    expect(highlight).toEqual(['D', 'C', 'B', 'A']);
  });

  it('reads a horizontal bar on an inversed y axis from the bottom', () => {
    const plain = read([seriesFor({ horizontal: true })], true);
    expect(plain.payload).toEqual(CATEGORIES);

    const { payload, highlight } = read(
      [seriesFor({ horizontal: true, alongInversed: true })],
      true,
    );
    expect(payload).toEqual(['D', 'C', 'B', 'A']);
    expect(highlight).toEqual(['D', 'C', 'B', 'A']);
  });

  it('reads a line on an inversed x axis from the left of the screen', () => {
    const { payload, highlight, layer } = read([
      seriesFor({ className: 'LineSeries', alongInversed: true }),
    ]);
    expect(layer.type).toBe('line');
    expect(payload).toEqual(['D', 'C', 'B', 'A']);
    expect(highlight).toEqual(['D', 'C', 'B', 'A']);
  });

  it('reads an area on an inversed x axis from the left of the screen', () => {
    const { payload, highlight, layer } = read([
      seriesFor({ className: 'LineSeries', alongInversed: true, filled: true }),
    ]);
    expect(layer.type).toBe('area');
    expect(payload).toEqual(['D', 'C', 'B', 'A']);
    expect(highlight).toEqual(['D', 'C', 'B', 'A']);
  });

  it('reads a step line on an inversed x axis from the left of the screen', () => {
    const { payload, highlight, layer } = read([
      seriesFor({ className: 'StepLineSeries', alongInversed: true }),
    ]);
    expect(layer.type).toBe('step');
    expect(payload).toEqual(['D', 'C', 'B', 'A']);
    expect(highlight).toEqual(['D', 'C', 'B', 'A']);
  });

  it('leaves a line alone when it is the value axis that is inversed', () => {
    const { payload, highlight } = read([
      seriesFor({ className: 'LineSeries', valueInversed: true }),
    ]);
    expect(payload).toEqual(CATEGORIES);
    expect(highlight).toEqual(CATEGORIES);
  });

  it('keeps a gapped series paired after the reversal', () => {
    // C is a gap. The extractor skips it and the resolver's filter skips it
    // too, so `col` indexes three marks rather than four -- and both halves
    // have to drop the same one AND turn over the same list. Reversing is
    // order-preserving under the filter, so the order of those two steps does
    // not matter; applying them to only one half does.
    const { payload, highlight } = read([
      seriesFor({ className: 'LineSeries', alongInversed: true, values: [10, 40, null, 30] }),
    ]);
    expect(payload).toEqual(['D', 'B', 'A']);
    expect(highlight).toEqual(['D', 'B', 'A']);
  });

  it('reverses every series of a stacked chart together', () => {
    const { payload, highlight, layer } = read([
      seriesFor({ name: 'one', alongInversed: true, stacked: true }),
      seriesFor({ name: 'two', alongInversed: true, stacked: true, values: [5, 15, 25, 10] }),
    ]);
    expect(layer.type).toBe('stacked_bar');
    expect(payload).toEqual(['D', 'C', 'B', 'A']);
    expect(highlight).toEqual(['D', 'C', 'B', 'A']);
  });
});
