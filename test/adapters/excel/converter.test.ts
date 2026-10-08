/**
 * @jest-environment jsdom
 */

import type { ExcelBinOptionsSnapshot, ExcelChartSnapshot, ExcelSeriesSnapshot } from '@adapters/excel/types';
import type {
  BarPoint,
  BoxPoint,
  CandlestickPoint,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  SegmentedPoint,
} from '@type/grammar';
import type { TextState, TraceState } from '@type/state';
import {
  BLANK_LABEL,
  convertExcelChart,
  convertExcelChartOutcome,
  excelChartTypeName,
  isSupportedExcelChartType,
} from '@adapters/excel/converter';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { Orientation, TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';

/**
 * The Excel converter: a snapshot of one native chart in, a MAIDR figure out.
 *
 * Every snapshot here is the plain object the reader produces -- the strings
 * `getDimensionValues` hands back, a blank cell as `''`, the chart's and the
 * axes' titles with their visibility -- because that is all the converter
 * reads.
 *
 * The last part does not trust the figure to itself: it builds MAIDR's real
 * model from it and checks that what the model announces is what the chart
 * holds, which a figure can get wrong while looking right (a horizontal bar
 * whose magnitude sits in the category field, say).
 */

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

/** One series read along the quarters. */
function series(name: string, values: string[], extra: Partial<ExcelSeriesSnapshot> = {}): ExcelSeriesSnapshot {
  return { name, categories: QUARTERS, values, ...extra };
}

function chart(chartType: string, list: ExcelSeriesSnapshot[], extra: Partial<ExcelChartSnapshot> = {}): ExcelChartSnapshot {
  return { chartType, name: 'Chart 1', series: list, ...extra };
}

/** Shown titles on both axes, as most charts built from Excel's presets have. */
const TITLED: Partial<ExcelChartSnapshot> = {
  title: { text: 'Sales by quarter', visible: true },
  axes: {
    category: { title: { text: 'Quarter', visible: true } },
    value: { title: { text: 'Sales', visible: true } },
  },
};

const NORTH = series('North', ['120', '135', '150', '170']);
const SOUTH = series('South', ['90', '110', '', '140']);

function convert(snapshot: ExcelChartSnapshot): Maidr {
  const maidr = convertExcelChart(snapshot, { id: 'xl' });
  if (maidr === null) {
    throw new Error('expected a figure');
  }
  return maidr;
}

function layers(maidr: Maidr): MaidrLayer[] {
  return maidr.subplots[0][0].layers;
}

function onlyLayer(maidr: Maidr): MaidrLayer {
  const all = layers(maidr);
  expect(all).toHaveLength(1);
  return all[0];
}

// The converter warns about what it cannot read, on purpose; a test that
// expects a warning reads this spy.
const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warn.mockClear();
});

afterAll(() => {
  warn.mockRestore();
});

function warned(): string {
  return warn.mock.calls.map(call => String(call[0])).join('\n');
}

describe('convertExcelChart', () => {
  describe('returns null, and says why, when there is nothing to read', () => {
    it('for no snapshot', () => {
      expect(convertExcelChart(undefined)).toBeNull();
      expect(convertExcelChart(null)).toBeNull();
    });

    it('for a chart with no series', () => {
      expect(convertExcelChart(chart('ColumnClustered', []))).toBeNull();
      expect(warned()).toContain('no series to read');
    });

    it('for a chart whose every series a chart filter hides', () => {
      const snapshot = chart('ColumnClustered', [{ ...NORTH, filtered: true }]);

      expect(convertExcelChart(snapshot)).toBeNull();
      expect(warned()).toContain('a chart filter hides every one');
    });

    it.each([
      'ColumnClustered',
      'Line',
      'Pie',
      'Area',
      'Radar',
      'Funnel',
      'XYScatter',
      'Bubble',
      'Surface',
      'PieOfPie',
      'Histogram',
      'Pareto',
      'Boxwhisker',
      'Waterfall',
      'Treemap',
      'RegionMap',
    ])('for a %s chart whose every reading is blank', (type) => {
      const blank = { name: 'Empty', categories: QUARTERS, values: ['', '', '', ''], xValues: ['', ''], yValues: ['', ''] };

      expect(convertExcelChart(chart(type, [blank]))).toBeNull();
      expect(warned()).toContain('every reading is blank');
    });

    it('for a pie with no positive slice', () => {
      expect(convertExcelChart(chart('Pie', [series('P', ['0', '-1', '', '0'])]))).toBeNull();
    });

    it('with an outcome that tells empty from unsupported', () => {
      expect(convertExcelChartOutcome(chart('Line', [series('L', ['', '', '', ''])]))).toEqual({ kind: 'empty' });
      expect(convertExcelChartOutcome(chart('SomethingNew', [NORTH]))).toEqual({ kind: 'unsupported', chartType: 'SomethingNew' });
    });
  });

  describe('figure metadata', () => {
    it('takes the title the chart shows, on the figure and its layers', () => {
      const maidr = convert(chart('ColumnClustered', [NORTH], TITLED));

      expect(maidr.id).toBe('xl');
      expect(maidr.title).toBe('Sales by quarter');
      expect(onlyLayer(maidr).title).toBe('Sales by quarter');
    });

    it('announces no title the author turned off', () => {
      const maidr = convert(chart('ColumnClustered', [NORTH], { title: { text: 'Chart Title', visible: false } }));

      expect(maidr.title).toBeUndefined();
      expect(onlyLayer(maidr).title).toBeUndefined();
    });

    it('generates a unique id when none is given', () => {
      const a = convertExcelChart(chart('ColumnClustered', [NORTH]));
      const b = convertExcelChart(chart('ColumnClustered', [NORTH]));

      expect(a?.id).toMatch(/^maidr-excel-\d+$/);
      expect(a?.id).not.toBe(b?.id);
    });
  });

  describe('column and bar charts', () => {
    it('reads one series of a clustered column chart as a vertical bar', () => {
      const layer = onlyLayer(convert(chart('ColumnClustered', [NORTH], TITLED)));

      expect(layer).toMatchObject({
        id: '0',
        type: TraceType.BAR,
        orientation: Orientation.VERTICAL,
        axes: { x: { label: 'Quarter' }, y: { label: 'Sales' } },
      });
      expect(layer.data).toEqual([
        { x: 'Q1', y: 120 },
        { x: 'Q2', y: 135 },
        { x: 'Q3', y: 150 },
        { x: 'Q4', y: 170 },
      ]);
    });

    it('leaves a blank bar out, since Excel draws none there', () => {
      const layer = onlyLayer(convert(chart('ColumnClustered', [SOUTH])));

      expect((layer.data as BarPoint[]).map(point => point.x)).toEqual(['Q1', 'Q2', 'Q4']);
    });

    it('reads several series as a dodged bar, a blank as a gap', () => {
      const maidr = convert(chart('ColumnClustered', [NORTH, SOUTH], TITLED));
      const layer = onlyLayer(maidr);

      expect(layer.type).toBe(TraceType.DODGED);
      const data = layer.data as SegmentedPoint[][];
      expect(data).toHaveLength(2);
      expect(data[0][0]).toEqual({ x: 'Q1', y: 120, z: 'North' });
      expect(data[1][2].x).toBe('Q3');
      expect(data[1][2].y).toBeNaN();
      expect(data[1][2].z).toBe('South');
      expect(maidr.subplots[0][0].legend).toEqual(['North', 'South']);
    });

    it('reads a stacked column chart as a stacked bar, and one series as a plain bar', () => {
      expect(onlyLayer(convert(chart('ColumnStacked', [NORTH, SOUTH]))).type).toBe(TraceType.STACKED);
      expect(onlyLayer(convert(chart('ColumnStacked', [NORTH]))).type).toBe(TraceType.BAR);
    });

    it('reads a 100% stacked chart as normalized, even with one series', () => {
      expect(onlyLayer(convert(chart('ColumnStacked100', [NORTH, SOUTH]))).type).toBe(TraceType.NORMALIZED);
      const single = onlyLayer(convert(chart('ColumnStacked100', [NORTH])));

      expect(single.type).toBe(TraceType.NORMALIZED);
      expect((single.data as SegmentedPoint[][])[0][0]).toEqual({ x: 'Q1', y: 120, z: 'North' });
    });

    it('reads a bar chart horizontally, the magnitude in x and the axes swapped', () => {
      const layer = onlyLayer(convert(chart('BarClustered', [NORTH], TITLED)));

      expect(layer.type).toBe(TraceType.BAR);
      expect(layer.orientation).toBe(Orientation.HORIZONTAL);
      expect(layer.axes).toEqual({ x: { label: 'Sales' }, y: { label: 'Quarter' } });
      expect((layer.data as BarPoint[])[0]).toEqual({ x: 120, y: 'Q1' });
    });

    it.each([
      ['BarClustered', TraceType.DODGED],
      ['BarStacked', TraceType.STACKED],
      ['BarStacked100', TraceType.NORMALIZED],
    ])('reads several series of a %s chart horizontally', (type, expected) => {
      const layer = onlyLayer(convert(chart(type, [NORTH, SOUTH])));

      expect(layer.type).toBe(expected);
      expect(layer.orientation).toBe(Orientation.HORIZONTAL);
      expect((layer.data as SegmentedPoint[][])[1][3]).toEqual({ x: 140, y: 'Q4', z: 'South' });
    });
  });

  describe('3-D, cylinder, cone and pyramid variants read as their flat chart', () => {
    it.each([
      ['3DColumnClustered', TraceType.DODGED, Orientation.VERTICAL],
      ['3DColumn', TraceType.DODGED, Orientation.VERTICAL],
      ['CylinderCol', TraceType.DODGED, Orientation.VERTICAL],
      ['ConeColClustered', TraceType.DODGED, Orientation.VERTICAL],
      ['PyramidColClustered', TraceType.DODGED, Orientation.VERTICAL],
      ['3DColumnStacked', TraceType.STACKED, Orientation.VERTICAL],
      ['CylinderColStacked100', TraceType.NORMALIZED, Orientation.VERTICAL],
      ['3DBarClustered', TraceType.DODGED, Orientation.HORIZONTAL],
      ['ConeBarStacked', TraceType.STACKED, Orientation.HORIZONTAL],
      ['PyramidBarStacked100', TraceType.NORMALIZED, Orientation.HORIZONTAL],
      ['ColumnClusteredEx', TraceType.DODGED, Orientation.VERTICAL],
    ])('%s', (type, expected, orientation) => {
      const layer = onlyLayer(convert(chart(type, [NORTH, SOUTH])));

      expect(layer.type).toBe(expected);
      expect(layer.orientation).toBe(orientation);
    });

    it.each([
      ['3DLine', TraceType.LINE],
      ['3DPie', TraceType.PIE],
      ['3DPieExploded', TraceType.PIE],
      ['3DArea', TraceType.AREA],
      ['3DAreaStacked', TraceType.STACKED_AREA],
      ['3DAreaStacked100', TraceType.NORMALIZED_AREA],
    ])('%s', (type, expected) => {
      expect(onlyLayer(convert(chart(type, [NORTH, SOUTH]))).type).toBe(expected);
    });
  });

  describe('line charts', () => {
    it.each(['Line', 'LineMarkers'])('reads one %s series as a single line, a blank as a gap at its position', (type) => {
      const layer = onlyLayer(convert(chart(type, [SOUTH], TITLED)));

      expect(layer.type).toBe(TraceType.LINE);
      expect(layer.axes).toEqual({ x: { label: 'Quarter' }, y: { label: 'Sales' } });
      expect(layer.data).toEqual([[
        { x: 'Q1', y: 90 },
        { x: 'Q2', y: 110 },
        { x: 'Q3', y: null },
        { x: 'Q4', y: 140 },
      ]]);
    });

    it('reads several series as one named line each', () => {
      const maidr = convert(chart('Line', [NORTH, SOUTH]));
      const data = onlyLayer(maidr).data as LinePoint[][];

      expect(data).toHaveLength(2);
      expect(data[1][3]).toEqual({ x: 'Q4', y: 140, z: 'South' });
      expect(maidr.subplots[0][0].legend).toEqual(['North', 'South']);
    });

    it.each(['LineStacked', 'LineMarkersStacked'])('reads a %s chart as a stacked area of each series\' own values', (type) => {
      const layer = onlyLayer(convert(chart(type, [NORTH, SOUTH])));

      expect(layer.type).toBe(TraceType.STACKED_AREA);
      // Excel draws South at North's height plus its own; the reading keeps
      // South's own value and leaves the total to the trace.
      expect((layer.data as LinePoint[][])[1][0]).toEqual({ x: 'Q1', y: 90, z: 'South' });
    });

    it.each(['LineStacked100', 'LineMarkersStacked100'])('reads a %s chart as a normalized area', (type) => {
      expect(onlyLayer(convert(chart(type, [NORTH, SOUTH]))).type).toBe(TraceType.NORMALIZED_AREA);
    });

    it('reads one stacked series as the line it is, and one 100% stacked series as normalized', () => {
      expect(onlyLayer(convert(chart('LineStacked', [NORTH]))).type).toBe(TraceType.LINE);
      expect(onlyLayer(convert(chart('LineStacked100', [NORTH]))).type).toBe(TraceType.NORMALIZED_AREA);
    });
  });

  describe('blank cells, as the chart plots them', () => {
    const plotted = (displayBlanksAs: string): Partial<ExcelChartSnapshot> => ({ displayBlanksAs });

    it.each(['Line', 'Area', 'LineStacked'])('reads a blank as zero on a %s chart that plots blanks as zero', (type) => {
      const layer = onlyLayer(convert(chart(type, [NORTH, SOUTH], plotted('Zero'))));

      expect((layer.data as LinePoint[][])[1][2]).toEqual({ x: 'Q3', y: 0, z: 'South' });
    });

    it.each(['NotPlotted', 'Interplotted'])('keeps a blank as a gap when the chart plots blanks as %s', (displayBlanksAs) => {
      const layer = onlyLayer(convert(chart('Line', [SOUTH], plotted(displayBlanksAs))));

      expect((layer.data as LinePoint[][])[0][2]).toEqual({ x: 'Q3', y: null });
    });

    it('reads a scatter\'s blank y as zero when the chart plots blanks as zero', () => {
      const points = { name: 'S', xValues: ['1', '2', '3'], yValues: ['4', '', '6'] };

      expect(onlyLayer(convert(chart('XYScatter', [points], plotted('Zero')))).data).toEqual([{ x: 1, y: 4 }, { x: 2, y: 0 }, { x: 3, y: 6 }]);
      expect(onlyLayer(convert(chart('XYScatterLines', [points], plotted('Zero')))).data).toEqual([[{ x: 1, y: 4 }, { x: 2, y: 0 }, { x: 3, y: 6 }]]);
    });

    it('leaves a bar\'s blank out and an error value a gap, whatever the chart plots blanks as', () => {
      const bars = onlyLayer(convert(chart('ColumnClustered', [SOUTH], plotted('Zero'))));
      const errors = onlyLayer(convert(chart('Line', [series('E', ['1', '#N/A', '3', '4'])], plotted('Zero'))));

      expect((bars.data as BarPoint[]).map(point => point.x)).toEqual(['Q1', 'Q2', 'Q4']);
      expect((errors.data as LinePoint[][])[0][1].y).toBeNull();
    });
  });

  describe('area charts', () => {
    it('reads an area chart as an area, its bands independent', () => {
      const layer = onlyLayer(convert(chart('Area', [NORTH, SOUTH])));

      expect(layer.type).toBe(TraceType.AREA);
      expect((layer.data as LinePoint[][])[1][2]).toEqual({ x: 'Q3', y: null, z: 'South' });
    });

    it('reads a stacked area with each band\'s own value, never the running edge', () => {
      const layer = onlyLayer(convert(chart('AreaStacked', [NORTH, SOUTH])));

      expect(layer.type).toBe(TraceType.STACKED_AREA);
      expect((layer.data as LinePoint[][])[1][0]).toEqual({ x: 'Q1', y: 90, z: 'South' });
    });

    it('reads one series of a stacked area as a plain area, and a 100% one as normalized', () => {
      expect(onlyLayer(convert(chart('AreaStacked', [NORTH]))).type).toBe(TraceType.AREA);
      expect(onlyLayer(convert(chart('AreaStacked100', [NORTH]))).type).toBe(TraceType.NORMALIZED_AREA);
      expect(onlyLayer(convert(chart('AreaStacked100', [NORTH, SOUTH]))).type).toBe(TraceType.NORMALIZED_AREA);
    });
  });

  describe('pie and doughnut charts', () => {
    it.each(['Pie', 'PieExploded', 'Doughnut', 'DoughnutExploded'])('reads a %s chart as one slice per category', (type) => {
      const layer = onlyLayer(convert(chart(type, [series('Share', ['30', '0', '20', '50'])])));

      expect(layer.type).toBe(TraceType.PIE);
      expect(layer.data).toEqual([{ x: 'Q1', y: 30 }, { x: 'Q3', y: 20 }, { x: 'Q4', y: 50 }]);
      expect(layer.axes).toEqual({ y: { label: 'Share' } });
    });

    it('drops blank, zero and negative slices, and warns about the negative ones', () => {
      const layer = onlyLayer(convert(chart('Pie', [series('Share', ['-5', '', '0', '10'])])));

      expect(layer.data).toEqual([{ x: 'Q4', y: 10 }]);
      expect(warned()).toContain('1 negative value(s) have no slice');
    });

    it('reads a doughnut\'s first ring and names how many it ignored', () => {
      const maidr = convert(chart('Doughnut', [NORTH, SOUTH]));

      expect(onlyLayer(maidr).data).toHaveLength(4);
      expect(warned()).toContain('reading "North" and ignoring 1 more');
      expect(maidr.subplots[0][0].legend).toBeUndefined();
    });

    it('starts the pie where Excel turned its first slice to', () => {
      const turned = onlyLayer(convert(chart('Pie', [{ ...NORTH, firstSliceAngle: 90 }])));
      const unturned = onlyLayer(convert(chart('Pie', [{ ...NORTH, firstSliceAngle: 0 }])));

      expect(turned.startAngle).toBe(90);
      expect(unturned.startAngle).toBeUndefined();
    });

    it('names the category axis from the header cell, with no axis to title', () => {
      const layer = onlyLayer(convert(chart('Pie', [NORTH], { categoryHeader: 'Quarter' })));

      expect(layer.axes).toEqual({ x: { label: 'Quarter' }, y: { label: 'North' } });
    });
  });

  describe('scatter charts', () => {
    const HEIGHT = { name: 'Height', xValues: ['1', '2', '3', ''], yValues: ['10', '', '30', '40'] };
    const WEIGHT = { name: 'Weight', xValues: ['1', '2'], yValues: ['5', '6'] };

    it('reads a scatter as points, dropping any missing a coordinate', () => {
      const layer = onlyLayer(convert(chart('XYScatter', [HEIGHT], {
        axes: { category: { title: { text: 'Age', visible: true } }, value: { title: { text: 'cm', visible: false } } },
      })));

      expect(layer.type).toBe(TraceType.SCATTER);
      expect(layer.data).toEqual([{ x: 1, y: 10 }, { x: 3, y: 30 }]);
      // A hidden value-axis title falls back to the lone series' name.
      expect(layer.axes).toEqual({ x: { label: 'Age' }, y: { label: 'Height' } });
    });

    it('reads one named point layer per series', () => {
      const maidr = convert(chart('XYScatter', [HEIGHT, WEIGHT]));

      expect(layers(maidr).map(layer => [layer.id, layer.name])).toEqual([['0', 'Height'], ['1', 'Weight']]);
      expect(maidr.subplots[0][0].legend).toEqual(['Height', 'Weight']);
    });

    it('numbers the points 1, 2, 3 when no X value is a number, as Excel plots them', () => {
      const unnumbered = onlyLayer(convert(chart('XYScatter', [{ name: 'S', xValues: ['', '', ''], yValues: ['4', '5', '6'] }])));
      const text = onlyLayer(convert(chart('XYScatter', [{ name: 'S', xValues: ['a', '2', '3'], yValues: ['4', '5', '6'] }])));

      expect(unnumbered.data).toEqual([{ x: 1, y: 4 }, { x: 2, y: 5 }, { x: 3, y: 6 }]);
      expect(text.data).toEqual([{ x: 1, y: 4 }, { x: 2, y: 5 }, { x: 3, y: 6 }]);
    });

    it.each(['XYScatterLines', 'XYScatterLinesNoMarkers', 'XYScatterSmooth', 'XYScatterSmoothNoMarkers'])('reads a %s chart as a line over numeric x, in the order Excel joins it', (type) => {
      const layer = onlyLayer(convert(chart(type, [{ name: 'S', xValues: ['3', '1', '', '2'], yValues: ['30', '', '5', '20'] }])));

      expect(layer.type).toBe(TraceType.LINE);
      expect(layer.data).toEqual([[{ x: 3, y: 30 }, { x: 1, y: null }, { x: 2, y: 20 }]]);
    });

    it('reads a scatter with lines titled Recall and Precision as a precision-recall curve', () => {
      const curve = { name: 'Model', xValues: ['0', '0.5', '1'], yValues: ['1', '0.8', '0.4'] };
      const titled = (x: string, y: string): Partial<ExcelChartSnapshot> => ({
        axes: { category: { title: { text: x, visible: true } }, value: { title: { text: y, visible: true } } },
      });

      const layer = onlyLayer(convert(chart('XYScatterLines', [curve], titled('Recall', 'Precision'))));
      const swapped = onlyLayer(convert(chart('XYScatterLines', [curve], titled('Precision', 'Recall'))));

      expect(layer.type).toBe(TraceType.PR_CURVE);
      expect(layer.data).toEqual([[{ x: 0, y: 1 }, { x: 0.5, y: 0.8 }, { x: 1, y: 0.4 }]]);
      expect(swapped.type).toBe(TraceType.LINE);
    });
  });

  describe('radar charts', () => {
    it.each(['Radar', 'RadarMarkers', 'RadarFilled'])('reads a %s chart as one outline per series', (type) => {
      const layer = onlyLayer(convert(chart(type, [NORTH, SOUTH])));

      expect(layer.type).toBe(TraceType.RADAR);
      expect((layer.data as LinePoint[][])[0][1]).toEqual({ x: 'Q2', y: 135, z: 'North' });
    });

    it('names a lone outline after its series too', () => {
      const layer = onlyLayer(convert(chart('Radar', [NORTH])));

      expect((layer.data as LinePoint[][])[0][0]).toEqual({ x: 'Q1', y: 120, z: 'North' });
    });
  });

  describe('funnel charts', () => {
    it('reads a funnel horizontally, the value as the band\'s width', () => {
      const stages = { name: 'Visitors', categories: ['Visited', 'Signed up', 'Paid'], values: ['1000', '', '40'] };
      const layer = onlyLayer(convert(chart('Funnel', [stages], { categoryHeader: 'Stage' })));

      expect(layer).toMatchObject({
        type: TraceType.FUNNEL,
        orientation: Orientation.HORIZONTAL,
        axes: { x: { label: 'Visitors' }, y: { label: 'Stage' } },
      });
      expect(layer.data).toEqual([{ x: 1000, y: 'Visited' }, { x: 40, y: 'Paid' }]);
    });
  });

  describe('stock charts', () => {
    const DAYS = ['2024-01-02', '2024-01-03', '2024-01-04'];
    const priced = (name: string, values: string[]): ExcelSeriesSnapshot => ({ name, categories: DAYS, values });

    it('reads open, high, low and close by position, whatever they are called', () => {
      const layer = onlyLayer(convert(chart('StockOHLC', [
        priced('First', ['10', '12', '11']),
        priced('Top', ['13', '14', '12']),
        priced('Bottom', ['9', '11', '10']),
        priced('Last', ['12', '11', '']),
      ], { axes: { value: { title: { text: 'Price', visible: true } } } })));

      expect(layer.type).toBe(TraceType.CANDLESTICK);
      expect(layer.axes).toEqual({ y: { label: 'Price' } });
      // The third day has no close, so no candle.
      expect(layer.data).toEqual([
        { value: '2024-01-02', open: 10, high: 13, low: 9, close: 12, volatility: 4 },
        { value: '2024-01-03', open: 12, high: 14, low: 11, close: 11, volatility: 3 },
      ]);
    });

    it('reads a high-low-close chart as candles with no open, inventing none', () => {
      const layer = onlyLayer(convert(chart('StockHLC', [
        priced('High', ['13', '14', '12']),
        priced('Low', ['9', '11', '']),
        priced('Close', ['12', '11', '11']),
      ], { axes: { value: { title: { text: 'Price', visible: true } } } })));

      expect(layer).toMatchObject({ type: TraceType.CANDLESTICK, axes: { y: { label: 'Price' } } });
      // The third day has no low, so no candle.
      expect(layer.data).toEqual([
        { value: '2024-01-02', high: 13, low: 9, close: 12, volatility: 4 },
        { value: '2024-01-03', high: 14, low: 11, close: 11, volatility: 3 },
      ]);
    });

    const SHARES = {
      axes: {
        value: { title: { text: 'Shares', visible: true } },
        secondaryValue: { title: { text: 'Price', visible: true } },
      },
    };

    it('reads the volume, first, as bars of their own beside the candles', () => {
      const maidr = convert(chart('StockVOHLC', [
        priced('Volume', ['500', '', '700']),
        priced('Open', ['10', '12', '11']),
        priced('High', ['13', '14', '12']),
        priced('Low', ['9', '11', '10']),
        priced('Close', ['12', '11', '11']),
      ], SHARES));
      const [candles, volume] = layers(maidr);

      // The prices are measured on the secondary axis, the volume on the primary.
      expect(candles).toMatchObject({ type: TraceType.CANDLESTICK, axes: { y: { label: 'Price' } } });
      expect((candles.data as CandlestickPoint[]).map(candle => 'volume' in candle)).toEqual([false, false, false]);
      expect(volume).toMatchObject({ type: TraceType.BAR, axes: { y: { label: 'Shares' } } });
      expect(volume.data).toEqual([{ x: '2024-01-02', y: 500 }, { x: '2024-01-04', y: 700 }]);
      expect(maidr.subplots[0][0].legend).toBeUndefined();
    });

    it('reads a volume-high-low-close chart as candles with no open, and the volume\'s bars', () => {
      const maidr = convert(chart('StockVHLC', [
        priced('Volume', ['500', '600', '700']),
        priced('High', ['13', '14', '12']),
        priced('Low', ['9', '11', '10']),
        priced('Close', ['12', '11', '11']),
      ]));

      expect(layers(maidr).map(layer => layer.type)).toEqual([TraceType.CANDLESTICK, TraceType.BAR]);
      expect((layers(maidr)[0].data as CandlestickPoint[]).map(candle => 'open' in candle)).toEqual([false, false, false]);
      // Without an axis title, the volume is named after its series.
      expect(layers(maidr)[1].axes).toEqual({ y: { label: 'Volume' } });
    });

    it('reads nothing from a stock chart missing a series', () => {
      expect(convertExcelChart(chart('StockOHLC', [priced('A', ['1']), priced('B', ['2'])]))).toBeNull();
      expect(warned()).toContain('reads 4 series (open, high, low, close)');
    });
  });

  describe('bubble charts', () => {
    const COUNTRIES: ExcelSeriesSnapshot = { name: 'Countries', xValues: ['1', '2', '3', '4'], yValues: ['10', '20', '', '40'], bubbleSizes: ['5', '0', '7', ''] };
    const AXES: Partial<ExcelChartSnapshot> = {
      axes: {
        category: { title: { text: 'GDP', visible: true } },
        value: { title: { text: 'Life expectancy', visible: true } },
      },
    };

    it.each(['Bubble', 'Bubble3DEffect', 'BubbleEx'])('reads a %s chart as points, each bubble\'s size its z', (type) => {
      const layer = onlyLayer(convert(chart(type, [{ ...COUNTRIES, sizeHeader: 'Population' }], AXES)));

      expect(layer.type).toBe(TraceType.SCATTER);
      expect(layer.axes).toEqual({ x: { label: 'GDP' }, y: { label: 'Life expectancy' }, z: { label: 'Population' } });
      // The second bubble has no size and the fourth none at all, so Excel
      // draws neither; the third has no y.
      expect(layer.data).toEqual([{ x: 1, y: 10, z: 5 }]);
      expect(warned()).toContain('2 bubble(s) of series "Countries" have no positive size');
    });

    it('names the size generically with no header cell to name it', () => {
      expect(onlyLayer(convert(chart('Bubble', [COUNTRIES], AXES))).axes?.z).toEqual({ label: 'Bubble size' });
    });

    it('reads each series as a layer of its own, named after it', () => {
      const other = { ...COUNTRIES, name: 'Cities', bubbleSizes: ['1', '1', '1', '1'] };

      expect(layers(convert(chart('Bubble', [COUNTRIES, other]))).map(layer => layer.name)).toEqual(['Countries', 'Cities']);
    });
  });

  describe('surface charts', () => {
    it.each(['Surface', 'SurfaceWireframe', 'SurfaceTopView', 'SurfaceTopViewWireframe'])('reads a %s chart as a heat grid, its first series at the bottom', (type) => {
      const layer = onlyLayer(convert(chart(type, [NORTH, SOUTH], {
        axes: {
          category: { title: { text: 'Quarter', visible: true } },
          value: { title: { text: 'Sales', visible: true } },
          series: { title: { text: 'Region', visible: true } },
        },
      })));

      expect(layer.type).toBe(TraceType.HEATMAP);
      expect(layer.axes).toEqual({ x: { label: 'Quarter' }, y: { label: 'Region' }, z: { label: 'Sales' } });
      expect(layer.data).toEqual({
        x: ['Q1', 'Q2', 'Q3', 'Q4'],
        y: ['South', 'North'],
        points: [[90, 110, null, 140], [120, 135, 150, 170]],
      });
    });
  });

  describe('pie of pie and bar of pie charts', () => {
    const SHARE: ExcelSeriesSnapshot = { name: 'Share', categories: ['A', 'B', 'C', 'D', 'E'], values: ['40', '30', '15', '10', '5'] };
    const split = (splitType: string, splitValue: number): ExcelSeriesSnapshot => ({ ...SHARE, splitType, splitValue });
    const plots = (maidr: Maidr): MaidrLayer[] => maidr.subplots[0].map(subplot => subplot.layers[0]);

    it('reads a pie of pie as two pies side by side, the split-off points one Other slice of the first', () => {
      const maidr = convert(chart('PieOfPie', [split('SplitByPosition', 2)]));
      const [main, second] = plots(maidr);

      expect(maidr.subplots).toHaveLength(1);
      expect(maidr.subplots[0]).toHaveLength(2);
      expect(main).toMatchObject({ id: '0', type: TraceType.PIE });
      expect(main.data).toEqual([{ x: 'A', y: 40 }, { x: 'B', y: 30 }, { x: 'C', y: 15 }, { x: 'Other', y: 15 }]);
      expect(second).toMatchObject({ id: '1', type: TraceType.PIE, name: 'Other' });
      expect(second.data).toEqual([{ x: 'D', y: 10 }, { x: 'E', y: 5 }]);
    });

    it('reads a bar of pie\'s second plot as bars', () => {
      const [, second] = plots(convert(chart('BarOfPie', [split('SplitByPosition', 2)])));

      expect(second).toMatchObject({ type: TraceType.BAR, name: 'Other' });
      expect(second.data).toEqual([{ x: 'D', y: 10 }, { x: 'E', y: 5 }]);
    });

    it.each([
      ['SplitByPosition', 1, ['E']],
      ['SplitByValue', 12, ['D', 'E']],
      ['SplitByPercentValue', 12, ['D', 'E']],
      ['SplitByPercentValue', 20, ['C', 'D', 'E']],
    ])('splits by %s %s as Excel does', (type, value, parted) => {
      const [, second] = plots(convert(chart('PieOfPie', [split(type, value)])));

      expect((second.data as BarPoint[]).map(point => point.x)).toEqual(parted);
    });

    it.each([undefined, 'Auto'])('splits the last three points off for a split of %s, Excel\'s default', (splitType) => {
      const unsorted = { ...SHARE, values: ['5', '40', '30', '15', '10'], ...(splitType === undefined ? {} : { splitType }) };
      const [, second] = plots(convert(chart('PieOfPie', [unsorted])));

      // By position, not by size: A, the smallest, stays in the main pie.
      expect(second.data).toEqual([{ x: 'C', y: 30 }, { x: 'D', y: 15 }, { x: 'E', y: 10 }]);
    });

    it('reads a custom split, which Office.js does not report, as one pie of every point', () => {
      const maidr = convert(chart('PieOfPie', [split('SplitByCustomSplit', 0)]));

      expect(maidr.subplots[0]).toHaveLength(1);
      expect(onlyLayer(maidr).data).toHaveLength(5);
      expect(warned()).toContain('custom pie split');
    });

    it('reads a custom split whose points the snapshot names, by their place in the series, blanks and all', () => {
      const withBlank = { ...SHARE, values: ['40', '', '30', '15', '10'], splitType: 'SplitByCustomSplit', splitPoints: [0, 3] };

      const [main, second] = plots(convert(chart('PieOfPie', [withBlank])));

      // B is blank and has no slice; A and D, points 0 and 3, are split off.
      expect(main.data).toEqual([{ x: 'C', y: 30 }, { x: 'E', y: 10 }, { x: 'Other', y: 55 }]);
      expect(second.data).toEqual([{ x: 'A', y: 40 }, { x: 'D', y: 15 }]);
      expect(warned()).not.toContain('custom pie split');
    });

    it('reads one pie when nothing is split off', () => {
      expect(convert(chart('PieOfPie', [split('SplitByValue', 1)])).subplots[0]).toHaveLength(1);
    });
  });

  describe('histograms', () => {
    // Scott's rule on these gives a width of 3.6083: s = 2.2211, n = 10.
    const SAMPLE = ['1', '2', '2', '3', '3', '3', '4', '4', '5', '9'];
    const scores = (binOptions?: ExcelBinOptionsSnapshot): ExcelSeriesSnapshot =>
      ({ name: 'Score', values: SAMPLE, ...(binOptions === undefined ? {} : { binOptions }) });
    const bins = (binOptions?: ExcelBinOptionsSnapshot): HistogramPoint[] =>
      onlyLayer(convert(chart('Histogram', [scores(binOptions)]))).data as HistogramPoint[];

    it('bins automatically by Scott\'s rule, from the smallest value, each bin closed on the right but the first', () => {
      const layer = onlyLayer(convert(chart('Histogram', [scores({ type: 'Auto' })])));
      const read = layer.data as HistogramPoint[];

      expect(layer.type).toBe(TraceType.HISTOGRAM);
      expect(layer.axes).toEqual({ x: { label: 'Score' }, y: { label: 'Count' } });
      expect(read.map(bin => bin.y)).toEqual([8, 1, 1]);
      // The edges are announced at the place of the width's third significant
      // figure: 4.61, not 4.608319134549957.
      expect(read.map(bin => [bin.xMin, bin.xMax])).toEqual([[1, 4.61], [4.61, 8.22], [8.22, 11.82]]);
      expect(read[0]).toMatchObject({ x: 2.805, yMin: 0, yMax: 8 });
    });

    it('bins automatically when the chart does not say how', () => {
      expect(bins().map(bin => bin.y)).toEqual([8, 1, 1]);
    });

    it('bins by the author\'s width, a value on an edge counted in the bin below it', () => {
      const read = bins({ type: 'BinWidth', width: 2 });

      expect(read.map(bin => [bin.xMin, bin.xMax, bin.y])).toEqual([[1, 3, 6], [3, 5, 3], [5, 7, 0], [7, 9, 1]]);
      expect(read.map(bin => bin.x)).toEqual([2, 4, 6, 8]);
    });

    it('bins into the author\'s count', () => {
      expect(bins({ type: 'BinCount', count: 4 }).map(bin => [bin.xMin, bin.xMax, bin.y])).toEqual([[1, 3, 6], [3, 5, 3], [5, 7, 0], [7, 9, 1]]);
    });

    it('gathers values at or below the underflow, and above the overflow, into bins of their own', () => {
      const rule = { allowUnderflow: true, underflowValue: 2, allowOverflow: true, overflowValue: 6 };

      expect(bins({ type: 'BinWidth', width: 2, ...rule }).map(bin => [bin.xMin, bin.xMax, bin.y])).toEqual([[1, 2, 3], [2, 4, 5], [4, 6, 1], [6, 9, 1]]);
      // A bin count includes those two bins, as Excel counts it.
      expect(bins({ type: 'BinCount', count: 4, ...rule }).map(bin => bin.y)).toEqual([3, 5, 1, 1]);
    });

    it('ignores an overflow or underflow value the chart does not enable', () => {
      expect(bins({ type: 'BinWidth', width: 2, allowOverflow: false, overflowValue: 6 }).map(bin => bin.y)).toEqual([6, 3, 0, 1]);
    });

    it('reads a histogram binned by category as each category\'s total', () => {
      const sales = { name: 'Sales', categories: ['a', 'b', 'a', 'c'], values: ['1', '2', '3', ''], binOptions: { type: 'Category' } };
      const layer = onlyLayer(convert(chart('Histogram', [sales])));

      expect(layer.type).toBe(TraceType.BAR);
      expect(layer.data).toEqual([{ x: 'a', y: 4 }, { x: 'b', y: 2 }]);
    });
  });

  describe('Pareto charts', () => {
    it('sorts the categories\' totals from largest to smallest, under a cumulative percentage line', () => {
      const defects = {
        name: 'Defects',
        categories: ['Scratch', 'Dent', 'Scratch', 'Crack', 'Dent', 'Chip'],
        values: ['10', '5', '20', '40', '5', '20'],
        binOptions: { type: 'Category' },
      };
      const [bars, line] = layers(convert(chart('Pareto', [defects])));

      expect(bars).toMatchObject({ type: TraceType.BAR, axes: { y: { label: 'Defects' } } });
      expect(bars.data).toEqual([{ x: 'Crack', y: 40 }, { x: 'Scratch', y: 30 }, { x: 'Chip', y: 20 }, { x: 'Dent', y: 10 }]);
      expect(line.type).toBe(TraceType.LINE);
      expect(line.data).toEqual([[{ x: 'Crack', y: 0.4 }, { x: 'Scratch', y: 0.7 }, { x: 'Chip', y: 0.9 }, { x: 'Dent', y: 1 }]]);
      // MAIDR's own percent format, which no content security policy blocks.
      expect(line.axes?.y).toEqual({ label: 'Cumulative percentage', format: { type: 'percent', decimals: 1 } });
    });

    it('bins numbers as a histogram does, then sorts the bins by their counts', () => {
      const scores = { name: 'Score', values: ['1', '2', '2', '3', '3', '3', '4', '4', '5', '9'], binOptions: { type: 'BinWidth', width: 2 } };
      const [bars, line] = layers(convert(chart('Pareto', [scores])));

      expect(bars.axes).toEqual({ x: { label: 'Score' }, y: { label: 'Count' } });
      expect(bars.data).toEqual([{ x: '[1, 3]', y: 6 }, { x: '(3, 5]', y: 3 }, { x: '(7, 9]', y: 1 }, { x: '(5, 7]', y: 0 }]);
      expect((line.data as LinePoint[][])[0].map(point => point.y)).toEqual([0.6, 0.9, 1, 1]);
    });
  });

  describe('box and whisker charts', () => {
    // QUARTILE.EXC gives 6 and 16 for these, QUARTILE.INC 7 and 14.
    const SCORES = ['3', '7', '8', '5', '12', '14', '21', '13', '18'];

    it('computes the quartiles exclusively, Excel\'s default', () => {
      const layer = onlyLayer(convert(chart('Boxwhisker', [{ name: 'Score', values: SCORES }])));

      expect(layer.type).toBe(TraceType.BOX);
      expect(layer.data).toEqual([{ z: 'Score', min: 3, q1: 6, q2: 12, q3: 16, max: 21, lowerOutliers: [], upperOutliers: [] }]);
    });

    it('computes them inclusively when the chart says so', () => {
      const layer = onlyLayer(convert(chart('Boxwhisker', [{ name: 'Score', values: SCORES, quartileCalculation: 'Inclusive' }])));

      expect((layer.data as BoxPoint[])[0]).toMatchObject({ q1: 7, q2: 12, q3: 14 });
    });

    it('ends each whisker at the furthest value within 1.5 IQR of the box, and calls the rest outliers', () => {
      const values = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '40'];
      const layer = onlyLayer(convert(chart('Boxwhisker', [{ name: 'Score', values }])));

      expect(layer.data).toEqual([{ z: 'Score', min: 1, q1: 3, q2: 6, q3: 9, max: 10, lowerOutliers: [], upperOutliers: [40] }]);
    });

    it('draws a box per category of each series, every series a layer of its own', () => {
      const north = { name: 'North', categories: ['A', 'B', 'A', 'B'], values: ['1', '10', '3', '12'] };
      const south = { name: 'South', categories: ['A', 'B', 'A', 'B'], values: ['2', '20', '', '22'] };
      const maidr = convert(chart('Boxwhisker', [north, south], { axes: { value: { title: { text: 'Score', visible: true } } } }));

      expect(layers(maidr).map(layer => [layer.type, layer.name, layer.axes?.y?.label])).toEqual([
        [TraceType.BOX, 'North', 'Score'],
        [TraceType.BOX, 'South', 'Score'],
      ]);
      expect((layers(maidr)[0].data as BoxPoint[]).map(box => [box.z, box.q2])).toEqual([['A', 2], ['B', 11]]);
      expect((layers(maidr)[1].data as BoxPoint[]).map(box => [box.z, box.q2])).toEqual([['A', 2], ['B', 21]]);
    });
  });

  describe('waterfall charts', () => {
    it('stands a point set as a total on the baseline, and goes on from its value', () => {
      const cash = { name: 'Cash', categories: ['Opening', 'Sales', 'Costs', 'Closing'], values: ['100', '50', '-30', '120'], totals: [0, 3] };
      const layer = onlyLayer(convert(chart('Waterfall', [cash])));

      expect(layer.data).toEqual([
        { x: 'Opening', start: 0, end: 100, delta: 100, kind: 'total' },
        { x: 'Sales', start: 100, end: 150, delta: 50, kind: 'increase' },
        { x: 'Costs', start: 150, end: 120, delta: -30, kind: 'decrease' },
        { x: 'Closing', start: 0, end: 120, delta: 120, kind: 'total' },
      ]);
    });

    it('reads each value as a step from the running total, a total set in Excel included', () => {
      const cash = { name: 'Cash', categories: ['Opening', 'Sales', 'Costs', 'Tax', 'Closing'], values: ['100', '50', '-30', '', '120'] };
      const layer = onlyLayer(convert(chart('Waterfall', [cash])));

      expect(layer).toMatchObject({ type: TraceType.WATERFALL, axes: { y: { label: 'Cash' } } });
      expect(layer.data).toEqual([
        { x: 'Opening', start: 0, end: 100, delta: 100, kind: 'increase' },
        { x: 'Sales', start: 100, end: 150, delta: 50, kind: 'increase' },
        { x: 'Costs', start: 150, end: 120, delta: -30, kind: 'decrease' },
        { x: 'Closing', start: 120, end: 240, delta: 120, kind: 'increase' },
      ]);
    });
  });

  describe('treemap and sunburst charts', () => {
    const POPULATION: ExcelSeriesSnapshot = { name: 'Population', categories: ['China', 'India', 'Nigeria', 'Egypt'], values: ['1425', '1428', '224', '0'] };
    const LEVELS = [['Asia', 'China'], ['Asia', 'India'], ['Africa', 'Nigeria'], ['Africa', 'Egypt']];

    it.each([
      ['Treemap', TraceType.TREEMAP],
      ['Sunburst', TraceType.SUNBURST],
    ])('reads a %s chart as leaves under their category levels', (type, expected) => {
      const layer = onlyLayer(convert(chart(type, [POPULATION], { categoryLevels: LEVELS, categoryHeader: 'Region / Country' })));

      expect(layer.type).toBe(expected);
      expect(layer.axes).toEqual({ x: { label: 'Region / Country' }, y: { label: 'Population' } });
      expect(layer.data).toEqual([
        { x: 'China', y: 1425, path: ['Asia'] },
        { x: 'India', y: 1428, path: ['Asia'] },
        { x: 'Nigeria', y: 224, path: ['Africa'] },
      ]);
      expect(warned()).toContain('1 zero or negative value(s) have no area');
    });

    it('reads one level without the category cells', () => {
      expect(onlyLayer(convert(chart('Treemap', [POPULATION]))).data).toEqual([
        { x: 'China', y: 1425 },
        { x: 'India', y: 1428 },
        { x: 'Nigeria', y: 224 },
      ]);
    });

    it('stops a path at the level its row reaches', () => {
      const regions = { name: 'Population', categories: ['China', 'Europe'], values: ['1425', '740'] };
      const layer = onlyLayer(convert(chart('Treemap', [regions], { categoryLevels: [['Asia', 'China'], ['Europe', '']] })));

      expect(layer.data).toEqual([{ x: 'China', y: 1425, path: ['Asia'] }, { x: 'Europe', y: 740 }]);
    });
  });

  describe('map charts', () => {
    it('reads a map chart as a choropleth of its regions, in the order of the data', () => {
      const rates = { name: 'Rate', categories: ['Washington', 'Oregon', 'Idaho'], values: ['12.1', '', '18.9'] };
      const layer = onlyLayer(convert(chart('RegionMap', [rates], { categoryHeader: 'State' })));

      expect(layer).toMatchObject({ type: TraceType.CHOROPLETH, axes: { x: { label: 'State' }, y: { label: 'Rate' } } });
      expect(layer.data).toEqual([{ x: 'Washington', y: 12.1 }, { x: 'Idaho', y: 18.9 }]);
    });
  });

  describe('combo charts', () => {
    const REVENUE = series('Revenue', ['100', '120', '140', '160'], { chartType: 'ColumnClustered' });
    const MARGIN = series('Margin', ['0.2', '0.25', '0.3', '0.28'], { chartType: 'Line', axisGroup: 'Secondary' });

    it('reads a column series and a line series as two layers of one subplot', () => {
      const maidr = convert(chart('ColumnClustered', [REVENUE, MARGIN], {
        axes: {
          category: { title: { text: 'Quarter', visible: true } },
          value: { title: { text: 'Dollars', visible: true } },
          secondaryValue: { title: { text: 'Margin (%)', visible: true } },
        },
      }));
      const [bars, line] = layers(maidr);

      expect(maidr.subplots).toHaveLength(1);
      expect(bars).toMatchObject({ id: '0', type: TraceType.BAR, axes: { x: { label: 'Quarter' }, y: { label: 'Dollars' } } });
      expect(line).toMatchObject({ id: '1', type: TraceType.LINE, axes: { x: { label: 'Quarter' }, y: { label: 'Margin (%)' } } });
      expect((line.data as LinePoint[][])[0][2]).toEqual({ x: 'Q3', y: 0.3 });
      // A layer switch announces the type, which tells these two apart.
      expect(bars.name).toBeUndefined();
      expect(maidr.subplots[0][0].legend).toEqual(['Revenue', 'Margin']);
    });

    it('keeps series on different value axes apart, and names layers of one type', () => {
      const visits = series('Visits', ['1', '2', '3', '4'], { chartType: 'Line' });
      const maidr = convert(chart('Line', [visits, MARGIN]));

      expect(layers(maidr).map(layer => [layer.type, layer.name])).toEqual([
        [TraceType.LINE, 'Visits'],
        [TraceType.LINE, 'Margin'],
      ]);
    });

    it('groups the series of one chart group into one layer', () => {
      const north = { ...NORTH, chartType: 'ColumnStacked' };
      const south = { ...SOUTH, chartType: 'ColumnStacked' };
      const maidr = convert(chart('ColumnStacked', [north, MARGIN, south]));

      expect(layers(maidr).map(layer => layer.type)).toEqual([TraceType.STACKED, TraceType.LINE]);
      expect((layers(maidr)[0].data as SegmentedPoint[][]).map(row => row[0].z)).toEqual(['North', 'South']);
    });

    it('reads a series that reports no type of its own as the chart\'s type', () => {
      const untyped = { ...NORTH, chartType: '' };

      expect(onlyLayer(convert(chart('Line', [untyped]))).type).toBe(TraceType.LINE);
    });

    it('reads the rest of a chart one of whose series it cannot read, and says what it left out', () => {
      const unknown = series('Forecast', ['1', '2', '3', '4'], { chartType: 'SomethingNew' });
      const outcome = convertExcelChartOutcome(chart('ColumnClustered', [REVENUE, unknown]));

      expect(outcome.kind).toBe('figure');
      if (outcome.kind === 'figure') {
        expect(outcome.maidr.subplots[0][0].layers.map(layer => layer.type)).toEqual([TraceType.BAR]);
        expect(outcome.omitted).toEqual([{ name: 'Forecast', chartType: 'SomethingNew', reason: expect.stringContaining('not one MAIDR knows') }]);
      }
      expect(warned()).toContain('read in part, leaving out "Forecast" (Something New');
    });

    it('leaves out a series of a type that is a chart of its own', () => {
      const boxes = series('Spread', ['1', '2', '3', '4'], { chartType: 'Boxwhisker' });
      const outcome = convertExcelChartOutcome(chart('Line', [NORTH, boxes]));

      expect(outcome.kind === 'figure' ? outcome.omitted.map(one => one.name) : []).toEqual(['Spread']);
      expect(warned()).toContain('reads only as a chart of its own');
    });

    it('declines a chart none of whose series it can read', () => {
      expect(convertExcelChartOutcome(chart('SomethingNew', [NORTH, SOUTH]))).toEqual({ kind: 'unsupported', chartType: 'SomethingNew' });
    });

    it('leaves nothing out of a chart it reads whole', () => {
      const outcome = convertExcelChartOutcome(chart('ColumnClustered', [REVENUE, MARGIN]));

      expect(outcome.kind === 'figure' && outcome.omitted).toEqual([]);
    });
  });

  describe('chart types', () => {
    // Every value of `Excel.ChartType` but `Invalid`, as Microsoft's reference
    // lists it, the preview-only `…Ex` types included.
    const EVERY_TYPE = [
      '3DArea',
      '3DAreaStacked',
      '3DAreaStacked100',
      '3DBarClustered',
      '3DBarStacked',
      '3DBarStacked100',
      '3DColumn',
      '3DColumnClustered',
      '3DColumnStacked',
      '3DColumnStacked100',
      '3DLine',
      '3DPie',
      '3DPieExploded',
      'Area',
      'AreaEx',
      'AreaStacked',
      'AreaStacked100',
      'AreaStacked100Ex',
      'AreaStackedEx',
      'BarClustered',
      'BarClusteredEx',
      'BarOfPie',
      'BarStacked',
      'BarStacked100',
      'BarStacked100Ex',
      'BarStackedEx',
      'Boxwhisker',
      'Bubble',
      'Bubble3DEffect',
      'BubbleEx',
      'ColumnClustered',
      'ColumnClusteredEx',
      'ColumnStacked',
      'ColumnStacked100',
      'ColumnStacked100Ex',
      'ColumnStackedEx',
      'ConeBarClustered',
      'ConeBarStacked',
      'ConeBarStacked100',
      'ConeCol',
      'ConeColClustered',
      'ConeColStacked',
      'ConeColStacked100',
      'CylinderBarClustered',
      'CylinderBarStacked',
      'CylinderBarStacked100',
      'CylinderCol',
      'CylinderColClustered',
      'CylinderColStacked',
      'CylinderColStacked100',
      'Doughnut',
      'DoughnutEx',
      'DoughnutExploded',
      'Funnel',
      'Histogram',
      'Line',
      'LineEx',
      'LineMarkers',
      'LineMarkersStacked',
      'LineMarkersStacked100',
      'LineStacked',
      'LineStacked100',
      'LineStacked100Ex',
      'LineStackedEx',
      'Pareto',
      'Pie',
      'PieEx',
      'PieExploded',
      'PieOfPie',
      'PyramidBarClustered',
      'PyramidBarStacked',
      'PyramidBarStacked100',
      'PyramidCol',
      'PyramidColClustered',
      'PyramidColStacked',
      'PyramidColStacked100',
      'Radar',
      'RadarFilled',
      'RadarMarkers',
      'RegionMap',
      'StockHLC',
      'StockOHLC',
      'StockVHLC',
      'StockVOHLC',
      'Sunburst',
      'Surface',
      'SurfaceTopView',
      'SurfaceTopViewWireframe',
      'SurfaceWireframe',
      'Treemap',
      'Waterfall',
      'XYScatter',
      'XYScatterEx',
      'XYScatterLines',
      'XYScatterLinesNoMarkers',
      'XYScatterSmooth',
      'XYScatterSmoothNoMarkers',
    ];

    it('has a reading for every type Excel.ChartType names', () => {
      expect(EVERY_TYPE).toHaveLength(97);
      expect(EVERY_TYPE.filter(type => !isSupportedExcelChartType(type))).toEqual([]);
    });

    it.each([
      ['Invalid', 'unknown'],
      ['SomethingNew', 'Something New'],
    ])('declines %s, a type with no reading, with a message naming it', (type, name) => {
      expect(convertExcelChart(chart(type, [NORTH]))).toBeNull();
      expect(isSupportedExcelChartType(type)).toBe(false);
      expect(excelChartTypeName(type)).toBe(name);
      expect(warned()).toContain(`is a ${name} chart, which MAIDR cannot read`);
    });

    it.each([
      ['Boxwhisker', 'Box and Whisker'],
      ['SurfaceTopView', 'Contour'],
      ['LineMarkersStacked100', '100% Stacked Line with Markers'],
      ['ColumnClustered', 'Column Clustered'],
      ['3DColumn', '3-D Column'],
    ])('names %s as Excel names it', (type, name) => {
      expect(excelChartTypeName(type)).toBe(name);
    });
  });

  describe('labels', () => {
    it('names the value axis after a lone series when its title is hidden', () => {
      const layer = onlyLayer(convert(chart('ColumnClustered', [NORTH], {
        axes: { value: { title: { text: 'Axis Title', visible: false } } },
      })));

      expect(layer.axes).toEqual({ y: { label: 'North' } });
    });

    it('leaves the value axis unnamed for several series with no title', () => {
      expect(onlyLayer(convert(chart('ColumnClustered', [NORTH, SOUTH]))).axes).toEqual({});
    });

    it('names the category axis from its header cell when the axis has no title', () => {
      const untitled = onlyLayer(convert(chart('ColumnClustered', [NORTH], { categoryHeader: ' Quarter ' })));
      const titled = onlyLayer(convert(chart('ColumnClustered', [NORTH], { ...TITLED, categoryHeader: 'Header' })));

      expect(untitled.axes?.x).toEqual({ label: 'Quarter' });
      expect(titled.axes?.x).toEqual({ label: 'Quarter' });
    });

    it('labels a blank category, and numbers categories Excel was given none of', () => {
      const blank = onlyLayer(convert(chart('ColumnClustered', [series('S', ['1', '2', '3', '4'], { categories: ['A', '', 'C', ' '] })])));
      const none = onlyLayer(convert(chart('ColumnClustered', [series('S', ['1', '2', '3'], { categories: [] })])));
      const empty = onlyLayer(convert(chart('ColumnClustered', [series('S', ['1', '2'], { categories: ['', ''] })])));

      expect((blank.data as BarPoint[]).map(point => point.x)).toEqual(['A', BLANK_LABEL, 'C', BLANK_LABEL]);
      expect((none.data as BarPoint[]).map(point => point.x)).toEqual(['1', '2', '3']);
      expect((empty.data as BarPoint[]).map(point => point.x)).toEqual(['1', '2']);
    });

    it('prefers the category cells\' displayed text when it lines up with the categories', () => {
      const dated = series('S', ['1', '2', '3'], { categories: ['45292', '45323', '45352'] });
      const layer = onlyLayer(convert(chart('Line', [dated], { categoryLabels: ['Jan 2024', 'Feb 2024', 'Mar 2024'] })));

      expect((layer.data as LinePoint[][])[0].map(point => point.x)).toEqual(['Jan 2024', 'Feb 2024', 'Mar 2024']);
    });

    it('keeps the categories when the cells do not line up with them', () => {
      const shifted = onlyLayer(convert(chart('ColumnClustered', [NORTH], { categoryLabels: ['Q2', 'Q3', 'Q4', 'Q1'] })));
      const short = onlyLayer(convert(chart('ColumnClustered', [NORTH], { categoryLabels: ['Q1', 'Q2'] })));

      expect((shifted.data as BarPoint[]).map(point => point.x)).toEqual(QUARTERS);
      expect((short.data as BarPoint[]).map(point => point.x)).toEqual(QUARTERS);
      expect(warned()).toContain('do not line up');
    });

    it('accepts joined label levels that contain the inner category', () => {
      const layer = onlyLayer(convert(chart('ColumnClustered', [NORTH], {
        categoryLabels: ['2024 Q1', '2024 Q2', '2025 Q3', '2025 Q4'],
      })));

      expect((layer.data as BarPoint[]).map(point => point.x)).toEqual(['2024 Q1', '2024 Q2', '2025 Q3', '2025 Q4']);
    });
  });

  describe('values', () => {
    it('parses numeric strings, whitespace and all', () => {
      const layer = onlyLayer(convert(chart('ColumnClustered', [series('S', [' 12.5 ', '-3', '1e3', '0'])])));

      expect((layer.data as BarPoint[]).map(point => point.y)).toEqual([12.5, -3, 1000, 0]);
    });

    it('reads an error value as a gap without complaint', () => {
      const layer = onlyLayer(convert(chart('Line', [series('S', ['1', '#N/A', '#DIV/0!', '4'])])));

      expect((layer.data as LinePoint[][])[0].map(point => point.y)).toEqual([1, null, null, 4]);
      expect(warn).not.toHaveBeenCalled();
    });

    it('reads text that is not a number as a gap, and says so', () => {
      const layer = onlyLayer(convert(chart('Line', [series('Sales', ['1', '$2.00', 'n/a', '4'])])));

      expect((layer.data as LinePoint[][])[0].map(point => point.y)).toEqual([1, null, null, 4]);
      expect(warned()).toContain('2 value(s) of series "Sales" are not numbers ("$2.00", "n/a")');
    });

    it('skips a series a chart filter hides', () => {
      const maidr = convert(chart('ColumnClustered', [NORTH, { ...SOUTH, filtered: true }]));

      expect(onlyLayer(maidr).type).toBe(TraceType.BAR);
      expect(maidr.subplots[0][0].legend).toBeUndefined();
    });

    it('pads a series shorter than the categories with gaps', () => {
      const layer = onlyLayer(convert(chart('Line', [series('S', ['1', '2'])])));

      expect((layer.data as LinePoint[][])[0]).toEqual([
        { x: 'Q1', y: 1 },
        { x: 'Q2', y: 2 },
        { x: 'Q3', y: null },
        { x: 'Q4', y: null },
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// What MAIDR's model makes of the figure
// ---------------------------------------------------------------------------

/**
 * Build MAIDR's real figure from a converted one, enter it, make the moves,
 * and return what each move announced.
 */
function announce(maidr: Maidr, moves: ((context: Context) => void)[]): TextState[] {
  const figure = new Figure(maidr);
  figure.applyLayout(resolveSubplotLayout(figure.subplots));
  const context = new Context(figure);
  const texts: TextState[] = [];
  figure.subplots.forEach(row => row.forEach(subplot => subplot.traces.forEach(traceRow => traceRow.forEach((trace) => {
    trace.addObserver({
      update: (state: TraceState): void => {
        if (!state.empty && state.type === 'trace') {
          texts.push(state.text);
        }
      },
    } as never);
  }))));
  context.enterSubplot();
  for (const move of moves) {
    move(context);
  }
  return texts;
}

const right = (context: Context): void => context.moveOnce('FORWARD');
const up = (context: Context): void => context.moveOnce('UPWARD');
const down = (context: Context): void => context.moveOnce('DOWNWARD');

describe('the figure reads in MAIDR\'s model as the chart holds it', () => {
  it('a column chart announces each quarter\'s value', () => {
    const texts = announce(convert(chart('ColumnClustered', [NORTH], TITLED)), [right, right]);

    expect(texts.map(text => [text.main.value, text.cross?.value])).toEqual([['Q1', 120], ['Q2', 135]]);
    expect(texts[0].main.label).toBe('Quarter');
    expect(texts[0].cross?.label).toBe('Sales');
  });

  it('a horizontal bar chart announces the category and its value, not the reverse', () => {
    const texts = announce(convert(chart('BarClustered', [NORTH], TITLED)), [right]);

    expect(texts.at(-1)?.main).toEqual({ label: 'Quarter', value: 'Q1' });
    expect(texts.at(-1)?.cross).toEqual({ label: 'Sales', value: 120 });
  });

  it('a clustered column chart announces the series, and its gap as missing', () => {
    const texts = announce(convert(chart('ColumnClustered', [NORTH, SOUTH], TITLED)), [right, right, right, up]);
    const gap = texts.at(-1);

    expect(gap?.main.value).toBe('Q3');
    expect(gap?.z?.value).toBe('South');
    expect(Number.isNaN(gap?.cross?.value)).toBe(true);
  });

  it('a stacked area announces the band\'s value with the running total', () => {
    // A line-shaped trace moves between its series by value: South is below.
    const texts = announce(convert(chart('AreaStacked', [NORTH, SOUTH])), [right, down]);

    expect(texts.at(-1)?.cross?.value).toBe(90);
    expect(texts.at(-1)?.stack?.value).toBe(210);
  });

  it('a pie announces each slice', () => {
    const texts = announce(convert(chart('Pie', [series('Share', ['30', '20', '50', ''])])), [right, right]);

    expect(texts.map(text => text.main.value)).toEqual(['Q1', 'Q2']);
  });

  it('a stock chart announces each period\'s close and trend, and its open above', () => {
    const days = ['Mon', 'Tue'];
    const priced = (name: string, values: string[]): ExcelSeriesSnapshot => ({ name, categories: days, values });
    const texts = announce(convert(chart('StockOHLC', [
      priced('Open', ['10', '12']),
      priced('High', ['13', '14']),
      priced('Low', ['9', '11']),
      priced('Close', ['12', '11']),
    ])), [right, right, up]);

    expect(texts.map(text => [text.main.value, text.section, text.cross?.value, text.z?.value])).toEqual([
      ['Mon', 'close', 12, 'Bull'],
      ['Tue', 'close', 11, 'Bear'],
      ['Tue', 'open', 12, 'Bear'],
    ]);
  });

  it('a funnel announces each stage\'s count and what it retained', () => {
    const stages = { name: 'People', categories: ['Visited', 'Paid'], values: ['1000', '40'] };
    const texts = announce(convert(chart('Funnel', [stages])), [right, right]);

    expect(texts.at(-1)?.main.value).toBe('Paid');
    expect(texts.at(-1)?.cross).toEqual({ label: 'People', value: 40 });
    expect(texts.at(-1)?.z?.value).toBe('4.0%');
  });

  it('a stacked line announces each band\'s own value with the running total', () => {
    const texts = announce(convert(chart('LineStacked', [NORTH, SOUTH])), [right, down]);

    expect(texts.at(-1)?.cross?.value).toBe(90);
    expect(texts.at(-1)?.stack?.value).toBe(210);
  });

  it('a bubble announces its size, named, alongside its position', () => {
    const points = { name: 'Countries', xValues: ['1', '2'], yValues: ['10', '20'], bubbleSizes: ['3', '4'], sizeHeader: 'Population' };
    const texts = announce(convert(chart('Bubble', [points])), [right, right]);

    expect(texts.map(text => [text.main.value, text.z])).toEqual([
      [1, { label: 'Population', value: 3 }],
      [2, { label: 'Population', value: 4 }],
    ]);
  });

  it('a surface starts on its first series, the bottom row of the grid', () => {
    const texts = announce(convert(chart('Surface', [NORTH, SOUTH])), [right]);

    expect([texts[0].main.value, texts[0].cross?.value, texts[0].z?.value]).toEqual(['Q1', 'North', 120]);
  });

  it('a histogram announces each bin\'s range and count', () => {
    const scores = { name: 'Score', values: ['1', '2', '2', '3', '3', '3', '4', '4', '5', '9'], binOptions: { type: 'BinWidth', width: 2 } };
    const texts = announce(convert(chart('Histogram', [scores])), [right, right]);

    expect(texts.map(text => [text.range, text.cross?.value])).toEqual([
      [{ min: 1, max: 3 }, 6],
      [{ min: 3, max: 5 }, 3],
    ]);
  });

  it('a box announces its quartiles as Excel computed them', () => {
    const texts = announce(convert(chart('Boxwhisker', [{ name: 'Score', values: ['3', '7', '8', '5', '12', '14', '21', '13', '18'] }])), [right, up, up, up]);

    expect(texts.slice(1).map(text => text.cross?.value)).toEqual([3, 6, 12]);
  });

  it('a waterfall announces each step and the running total', () => {
    const cash = { name: 'Cash', categories: ['Opening', 'Sales', 'Costs'], values: ['100', '50', '-30'] };
    const texts = announce(convert(chart('Waterfall', [cash])), [right, right, right]);

    expect(texts.map(text => [text.main.value, text.cross?.value, text.stack?.value])).toEqual([
      ['Opening', 100, 100],
      ['Sales', 50, 150],
      ['Costs', -30, 120],
    ]);
  });

  it('a treemap starts at its outer level, each branch the sum of its leaves', () => {
    const population = { name: 'Population', categories: ['China', 'India', 'Nigeria'], values: ['1425', '1428', '224'] };
    const levels = [['Asia', 'China'], ['Asia', 'India'], ['Africa', 'Nigeria']];
    const texts = announce(convert(chart('Treemap', [population], { categoryLevels: levels })), [right, right]);

    expect(texts.map(text => [text.main.value, text.cross?.value])).toEqual([['Asia', 2853], ['Africa', 224]]);
  });

  it('a map announces each region and its value', () => {
    const rates = { name: 'Rate', categories: ['Washington', 'Oregon'], values: ['12', '16'] };
    const texts = announce(convert(chart('RegionMap', [rates])), [right, right]);

    expect(texts.map(text => [text.main.value, text.cross?.value])).toEqual([['Washington', 12], ['Oregon', 16]]);
  });

  it('a high-low-close chart announces its prices, and no open or trend', () => {
    const days = ['Mon', 'Tue'];
    const priced = (name: string, values: string[]): ExcelSeriesSnapshot => ({ name, categories: days, values });
    const texts = announce(convert(chart('StockHLC', [priced('High', ['13', '14']), priced('Low', ['9', '11']), priced('Close', ['12', '11'])])), [right, up]);

    expect(texts.map(text => [text.main.value, text.section, text.cross?.value, text.z])).toEqual([
      ['Mon', 'close', 12, undefined],
      ['Mon', 'high', 13, undefined],
    ]);
  });

  it('a pie of pie builds both of its plots', () => {
    const share = { name: 'Share', categories: ['A', 'B', 'C'], values: ['60', '30', '10'], splitType: 'SplitByPosition', splitValue: 1 };
    const figure = new Figure(convert(chart('PieOfPie', [share])));

    expect(figure.subplots[0]).toHaveLength(2);
  });

  it('a scatter announces its points by x', () => {
    const points = { name: 'S', xValues: ['1', '2'], yValues: ['10', '20'] };
    const texts = announce(convert(chart('XYScatter', [points])), [right, right]);

    // A column of a scatter can hold several points, so y is read as a list.
    expect(texts.map(text => [text.main.value, text.cross?.value])).toEqual([[1, [10]], [2, [20]]]);
  });
});
