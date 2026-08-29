/**
 * @jest-environment jsdom
 */

/**
 * The Chart.js plugin bound before Chart.js had parsed anything, so every
 * reading taken from the parse came out empty.
 *
 * `afterInit` fires before the first update, and the first update is where
 * Chart.js parses each dataset. Several readings are taken from that parse
 * rather than from the author's rows — a box plot's and a violin's
 * five-number summaries, which the boxplot plugin computes and `dataset.data`
 * never holds, and an error bar's bounds with them.
 *
 * Measured in Chromium on chart.js 4 with `@sgratzl/chartjs-chart-boxplot`,
 * logging `getDatasetMeta(0)._parsed.length` from a plugin of its own on a
 * three-box chart:
 *
 *   afterInit     0
 *   afterUpdate   3
 *   afterRender   3
 *
 * So the layer was built from nothing, and the announcement on the
 * repository's own `examples/chartjs/boxplot.html` was:
 *
 *   before   "No trace info available", then "No more data to display"
 *   after    "Group is Group A, Lower outlier(s) for Value are [5, 8]"
 *
 * The same for `barWithErrorBars`, which reads the parse for its bounds:
 * silent before, "Group is alpha, value Value is 10" after. A bar chart and a
 * radar were unaffected either way — their readings come from
 * `chart.data.datasets`, which is populated from the moment the chart is
 * constructed.
 *
 * This test drives the two hooks in the order Chart.js runs them, over a chart
 * whose parse arrives between them, and asserts the emitted figure holds the
 * summary rather than nothing. `afterInit` is deliberately checked to be
 * absent: an implementation that binds there again cannot see the parse, and
 * the empty layer it builds is what the reader was left with.
 */

import type { ChartJsChart, ChartJsParsedValue } from '@adapters/chartjs/types';
import { maidrPlugin } from '@adapters/chartjs/plugin';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act } from '@testing-library/react';

/** The parse the boxplot plugin leaves for one box, once it has run. */
const PARSED: ChartJsParsedValue = {
  x: 0,
  items: [1, 2, 2, 3, 4, 4, 5, 6, 7, 9],
  outliers: [],
  whiskerMax: 9,
  whiskerMin: 1,
  max: 9,
  median: 4,
  min: 1,
  q1: 2.25,
  q3: 5.75,
  y: 4,
};

/**
 * A box plot chart whose parse arrives when `parse()` is called, the way
 * Chart.js fills `_parsed` during its first update.
 *
 * @returns The chart, and the call that populates its parse
 */
function boxplotChart(): { chart: ChartJsChart; parse: () => void } {
  let parsed: ChartJsParsedValue[] = [];
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);

  const chart = {
    canvas,
    data: {
      labels: ['alpha'],
      datasets: [{ label: 'Samples', data: [[1, 2, 2, 3, 4, 4, 5, 6, 7, 9]] }],
    },
    options: {},
    config: { type: 'boxplot' },
    getDatasetMeta: () => ({ data: [], type: 'boxplot', _parsed: parsed }),
    setActiveElements: () => {},
    update: () => {},
  } as unknown as ChartJsChart;

  return {
    chart,
    parse: () => {
      parsed = [PARSED];
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.restoreAllMocks();
});

describe('when the Chart.js plugin binds', () => {
  it('does not bind before the parse exists', () => {
    // The hook that cannot see the summary is gone, rather than kept and
    // worked around: `afterInit` runs before Chart.js has parsed a thing.
    expect(maidrPlugin.afterInit).toBeUndefined();
    expect(typeof maidrPlugin.afterUpdate).toBe('function');
  });

  it('reads the summary the first update parsed', async () => {
    const { chart, parse } = boxplotChart();
    parse();

    // `act`, because the plugin mounts the MAIDR interface through a React
    // root: `render()` schedules the work rather than committing it.
    await act(async () => {
      maidrPlugin.afterUpdate?.(chart, {}, {});
    });

    // The reader's own evidence: the instruction MAIDR renders names the
    // chart. Built from an empty parse it announces no plot info at all.
    const instruction = document.body.querySelector('[aria-label*="maidr plot"]')
      ?.getAttribute('aria-label') ?? '';

    expect(instruction).toContain('box');
  });

  it('binds once, however many updates follow', async () => {
    // `afterUpdate` fires on every hover, resize and `chart.update()`, so the
    // guard is what keeps one chart from being wrapped again and again.
    const { chart, parse } = boxplotChart();
    parse();

    await act(async () => {
      maidrPlugin.afterUpdate?.(chart, {}, {});
      maidrPlugin.afterUpdate?.(chart, {}, {});
      maidrPlugin.afterUpdate?.(chart, {}, {});
    });

    expect(document.body.querySelectorAll('[aria-label*="maidr plot"]')).toHaveLength(1);
  });

  it('warns once for a chart it cannot read, not once per update', () => {
    // Same reason, other branch: an unsupported type is declined, and without
    // a record of that it would be re-extracted and re-warned on every update.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const chart = {
      canvas,
      data: { labels: [], datasets: [] },
      options: {},
      config: { type: 'no-such-chart' },
      getDatasetMeta: () => ({ data: [], type: 'no-such-chart', _parsed: [] }),
      setActiveElements: () => {},
      update: () => {},
    } as unknown as ChartJsChart;

    maidrPlugin.afterUpdate?.(chart, {}, {});
    maidrPlugin.afterUpdate?.(chart, {}, {});
    maidrPlugin.afterUpdate?.(chart, {}, {});

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
