/**
 * @jest-environment jsdom
 */

import type { BoxSelector, CandlestickSelector } from '@type/grammar';
import { apexchartsToMaidr } from '@adapters/apexcharts';
import { computeBoxParts, computeCandleParts, pathVertices, splitBoxes } from '@adapters/apexcharts/split';
import { afterAll, afterEach, describe, expect, it, jest } from '@jest/globals';
import { fakeChart, matches, svg } from './helpers';

/**
 * Cutting ApexCharts' composite box and candle outlines into the parts MAIDR
 * highlights. The `d` strings are ApexCharts 7.6.0's own, copied from a
 * browser: a vertical box plot, a horizontal one, and a candlestick.
 */

// Box g1 = [10, 20, 30, 40, 50], vertical.
const BOX_LOWER = 'M -57.82875 183.01128 L 0 183.01128 L 0 244.01504 L -28.914375 244.01504 L 28.914375 244.01504 L 0 244.01504 L 0 183.01128 L 57.82875 183.01128 L 57.82875 122.00752 L -57.82875 122.00752 L -57.82875 183.51128';
const BOX_UPPER = 'M -57.82875 122.00752 L 57.82875 122.00752 L 57.82875 61.00376 L 0 61.00376 L 0 0 L 28.914375 0 L -28.914375 0 L 0 0 L 0 61.00376 L -57.82875 61.00376 L -57.82875 122.00752z';

// The same box, horizontal.
const HBOX_LOWER = 'M 220.4 22.87641 L 220.4 76.2547 L 110.25 76.2547 L 110.25 49.56556 L 110.25 102.94385 L 110.25 76.2547 L 220.4 76.2547 L 220.4 129.63299 L 330.55 129.63299 L 330.55 22.87641 L 220.9 22.87641';
const HBOX_UPPER = 'M 330.55 22.87641 L 330.55 129.63299 L 440.7 129.63299 L 440.7 76.2547 L 550.85 76.2547 L 550.85 102.94385 L 550.85 49.56556 L 550.85 76.2547 L 440.7 76.2547 L 440.7 22.87641 L 330.55 22.87641z';

// Candle [open 20, high 40, low 10, close 30].
const CANDLE = 'M -57.82875 101.67294 L 0 101.67294 L 0 0 L 0 101.67294 L 57.82875 101.67294 L 57.82875 203.34587 L 0 203.34587 L 0 305.01881 L 0 203.34587 L -57.82875 203.34587 L -57.82875 101.17294';

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterEach(() => {
  document.body.innerHTML = '';
  warn.mockClear();
});

afterAll(() => {
  warn.mockRestore();
});

describe('computeBoxParts', () => {
  it('should cut a vertical box into its body, quartile edges, median and caps', () => {
    const parts = computeBoxParts(BOX_LOWER, BOX_UPPER, false);

    expect(parts).toEqual({
      iq: 'M -57.829 183.011 L 57.829 183.011 L 57.829 61.004 L -57.829 61.004 Z',
      q1: 'M -57.829 183.011 L 57.829 183.011',
      q2: 'M -57.829 122.008 L 57.829 122.008',
      q3: 'M -57.829 61.004 L 57.829 61.004',
      min: 'M -28.914 244.015 L 28.914 244.015',
      max: 'M 28.914 0 L -28.914 0',
    });
  });

  it('should cut a horizontal box the same way with the axes exchanged', () => {
    const parts = computeBoxParts(HBOX_LOWER, HBOX_UPPER, true);

    expect(parts?.q1).toBe('M 220.4 22.876 L 220.4 129.633');
    expect(parts?.q2).toBe('M 330.55 22.876 L 330.55 129.633');
    expect(parts?.q3).toBe('M 440.7 22.876 L 440.7 129.633');
    expect(parts?.min).toBe('M 110.25 49.566 L 110.25 102.944');
    expect(parts?.max).toBe('M 550.85 102.944 L 550.85 49.566');
  });

  it('should refuse an outline of another shape', () => {
    expect(computeBoxParts('M 0 0 L 1 1', BOX_UPPER, false)).toBeNull();
    expect(computeBoxParts(BOX_LOWER, BOX_UPPER, true)).toBeNull();
  });
});

describe('computeCandleParts', () => {
  it('should cut a candle into its body and wicks', () => {
    expect(computeCandleParts(CANDLE)).toEqual({
      'body': 'M -57.829 101.673 L 57.829 101.673 L 57.829 203.346 L -57.829 203.346 Z',
      'wick-high': 'M 0 101.673 L 0 0',
      'wick-low': 'M 0 203.346 L 0 305.019',
    });
  });

  it('should read every vertex of an outline', () => {
    expect(pathVertices(CANDLE)).toHaveLength(11);
  });
});

describe('splitting the drawn chart', () => {
  /**
   * A box plot series group holding one box.
   *
   * @returns The chart, and the group
   */
  function boxChart(): { chart: ReturnType<typeof fakeChart>; group: () => Element } {
    let group: Element | null = null;
    const chart = fakeChart({
      type: 'boxPlot',
      series: [{ name: 'B', values: [50] }],
      labels: [1],
      categoryLabels: ['g1'],
      isXNumeric: true,
      globals: {
        seriesCandleO: [[10]],
        seriesCandleH: [[20]],
        seriesCandleM: [[30]],
        seriesCandleL: [[40]],
        seriesCandleC: [[50]],
      },
      draw: (dom) => {
        group = dom.series(0, 'apexcharts-boxPlot-series');
        svg('path', { 'class': 'apexcharts-boxPlot-area', 'j': 0, 'd': BOX_LOWER, 'fill': '#00f', 'stroke': '#333', 'stroke-width': 1 }, group);
        svg('path', { 'class': 'apexcharts-boxPlot-area', 'j': 0, 'd': BOX_UPPER, 'fill': '#0f0', 'stroke': '#333', 'stroke-width': 1 }, group);
      },
    });
    return { chart, group: () => group as unknown as Element };
  }

  it('should resolve every box selector to exactly one hidden part', () => {
    const { chart } = boxChart();

    const selectors = apexchartsToMaidr(chart).subplots[0][0].layers[0].selectors as BoxSelector[];

    for (const field of ['min', 'iq', 'q1', 'q2', 'q3', 'max'] as const) {
      const found = matches(selectors[0][field] as string);
      expect(found).toHaveLength(1);
      expect(found[0].getAttribute('visibility')).toBe('hidden');
      expect(found[0].getAttribute('pointer-events')).toBe('none');
    }
    expect(matches(selectors[0].iq)[0].getAttribute('fill')).toBe('#0f0');
    expect(matches(selectors[0].q2)[0].getAttribute('fill')).toBe('none');
  });

  it('should not add parts when the chart is converted again', () => {
    const { chart, group } = boxChart();

    apexchartsToMaidr(chart);
    apexchartsToMaidr(chart);

    expect(group().querySelectorAll('[data-maidr-part]')).toHaveLength(6);
  });

  it('should drop parts left behind when ApexCharts replaced the box', () => {
    const { chart, group } = boxChart();
    apexchartsToMaidr(chart);
    group().querySelectorAll('path.apexcharts-boxPlot-area').forEach(p => p.remove());
    svg('path', { class: 'apexcharts-boxPlot-area', j: 0, d: BOX_LOWER }, group());
    svg('path', { class: 'apexcharts-boxPlot-area', j: 0, d: BOX_UPPER }, group());

    expect(splitBoxes(group(), false)).toEqual([]);

    expect(group().querySelectorAll('[data-maidr-part]')).toHaveLength(6);
    expect(group().querySelectorAll('[data-maidr-part="iq"]')[0].previousElementSibling?.getAttribute('class'))
      .toBe('apexcharts-boxPlot-area');
  });

  it('should follow a change to the original outline', async () => {
    const { chart, group } = boxChart();
    apexchartsToMaidr(chart);
    const upper = group().querySelectorAll('path.apexcharts-boxPlot-area')[1];

    upper.setAttribute('d', BOX_UPPER.replace('L 0 0 L 28.914375 0 L -28.914375 0 L 0 0', 'L 0 5 L 28.914375 5 L -28.914375 5 L 0 5'));
    await Promise.resolve();

    expect(group().querySelector('[data-maidr-part="max"]')?.getAttribute('d')).toBe('M 28.914 5 L -28.914 5');
  });

  it('should leave a box of an unknown shape unsplit and say so', () => {
    const chart = fakeChart({
      type: 'boxPlot',
      series: [{ name: 'B', values: [50] }],
      labels: ['g1'],
      globals: { seriesCandleO: [[10]], seriesCandleH: [[20]], seriesCandleM: [[30]], seriesCandleL: [[40]], seriesCandleC: [[50]] },
      draw: (dom) => {
        const group = dom.series(0, 'apexcharts-boxPlot-series');
        svg('path', { class: 'apexcharts-boxPlot-area', j: 0, d: 'M 0 0 L 1 1' }, group);
        svg('path', { class: 'apexcharts-boxPlot-area', j: 0, d: 'M 0 0 L 1 1' }, group);
      },
    });

    const layer = apexchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.data).toHaveLength(1);
    expect(document.querySelectorAll('[data-maidr-part]')).toHaveLength(0);
    expect(String(warn.mock.calls[0][0])).toContain('could not be split');
  });

  it('should resolve every candle selector to exactly one part', () => {
    const chart = fakeChart({
      type: 'candlestick',
      series: [{ name: 'C', values: [30] }],
      labels: [1],
      categoryLabels: ['d1'],
      isXNumeric: true,
      globals: { seriesCandleO: [[20]], seriesCandleH: [[40]], seriesCandleL: [[10]], seriesCandleC: [[30]] },
      draw: (dom) => {
        const group = dom.series(0, 'apexcharts-candlestick-series');
        svg('path', { class: 'apexcharts-candlestick-area', j: 0, d: CANDLE, fill: '#0a0', stroke: '#0a0' }, group);
      },
    });

    const selectors = apexchartsToMaidr(chart).subplots[0][0].layers[0].selectors as CandlestickSelector;

    expect(matches((selectors.body as string[])[0])[0].getAttribute('d')).toBe(computeCandleParts(CANDLE)?.body);
    expect(matches((selectors.wickHigh as string[])[0])).toHaveLength(1);
    expect(matches((selectors.wickLow as string[])[0])).toHaveLength(1);
  });
});
