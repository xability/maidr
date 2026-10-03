/**
 * @jest-environment jsdom
 */

import type { ExcelChartSnapshot, ExcelSeriesSnapshot } from '@adapters/excel/types';
import type {
  BarPoint,
  CandlestickPoint,
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

    it.each(['ColumnClustered', 'Line', 'Pie', 'Area', 'Radar', 'Funnel', 'XYScatter'])('for a %s chart whose every reading is blank', (type) => {
      const blank = { name: 'Empty', categories: QUARTERS, values: ['', '', '', ''], xValues: ['', ''], yValues: ['', ''] };

      expect(convertExcelChart(chart(type, [blank]))).toBeNull();
      expect(warned()).toContain('every reading is blank');
    });

    it('for a pie with no positive slice', () => {
      expect(convertExcelChart(chart('Pie', [series('P', ['0', '-1', '', '0'])]))).toBeNull();
    });

    it('with an outcome that tells empty from unsupported', () => {
      expect(convertExcelChartOutcome(chart('Line', [series('L', ['', '', '', ''])]))).toEqual({ kind: 'empty' });
      expect(convertExcelChartOutcome(chart('Treemap', [NORTH]))).toEqual({ kind: 'unsupported', chartType: 'Treemap' });
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

    it.each(['LineStacked', 'LineStacked100', 'LineMarkersStacked', 'LineMarkersStacked100'])('declines a %s chart rather than announce its totals as values', (type) => {
      expect(convertExcelChartOutcome(chart(type, [NORTH, SOUTH]))).toEqual({ kind: 'unsupported', chartType: type });
      expect(warned()).toContain('Stacked Line');
      expect(warned()).toContain('no stacked line reading');
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
  });

  describe('radar charts', () => {
    it.each(['Radar', 'RadarMarkers', 'RadarFilled'])('reads a %s chart as one outline per series', (type) => {
      const layer = onlyLayer(convert(chart(type, [NORTH, SOUTH])));

      expect(layer.type).toBe(TraceType.RADAR);
      expect((layer.data as LinePoint[][])[0][1]).toEqual({ x: 'Q2', y: 135, z: 'North' });
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

    it('reads a high-low-close chart without inventing an open', () => {
      const layer = onlyLayer(convert(chart('StockHLC', [
        priced('High', ['13', '14', '12']),
        priced('Low', ['9', '11', '10']),
        priced('Close', ['12', '11', '11']),
      ])));

      expect((layer.data as CandlestickPoint[]).map(candle => 'open' in candle)).toEqual([false, false, false]);
    });

    it('reads the volume first, and the price from the secondary axis', () => {
      const layer = onlyLayer(convert(chart('StockVOHLC', [
        priced('Volume', ['500', '', '700']),
        priced('Open', ['10', '12', '11']),
        priced('High', ['13', '14', '12']),
        priced('Low', ['9', '11', '10']),
        priced('Close', ['12', '11', '11']),
      ], {
        axes: {
          value: { title: { text: 'Shares', visible: true } },
          secondaryValue: { title: { text: 'Price', visible: true } },
        },
      })));

      expect(layer.axes).toEqual({ y: { label: 'Price' } });
      expect((layer.data as CandlestickPoint[]).map(candle => candle.volume)).toEqual([500, undefined, 700]);
    });

    it('reads nothing from a stock chart missing a series', () => {
      expect(convertExcelChart(chart('StockOHLC', [priced('A', ['1']), priced('B', ['2'])]))).toBeNull();
      expect(warned()).toContain('reads 4 series (open, high, low, close)');
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

    it('declines the whole chart when one of its series cannot be read', () => {
      const stacked = series('Total', ['1', '2', '3', '4'], { chartType: 'LineStacked' });

      expect(convertExcelChartOutcome(chart('ColumnClustered', [REVENUE, stacked]))).toEqual({ kind: 'unsupported', chartType: 'LineStacked' });
    });
  });

  describe('chart types MAIDR does not read yet', () => {
    it.each([
      ['Histogram', 'Histogram'],
      ['Pareto', 'Pareto'],
      ['Boxwhisker', 'Box and Whisker'],
      ['Waterfall', 'Waterfall'],
      ['Treemap', 'Treemap'],
      ['Sunburst', 'Sunburst'],
      ['RegionMap', 'Map'],
      ['Bubble', 'Bubble'],
      ['Bubble3DEffect', '3-D Bubble'],
      ['Surface', '3-D Surface'],
      ['SurfaceTopView', 'Contour'],
      ['PieOfPie', 'Pie of Pie'],
      ['BarOfPie', 'Bar of Pie'],
      ['Invalid', 'unknown'],
      ['SomethingNew', 'Something New'],
    ])('declines %s with a message naming it', (type, name) => {
      expect(convertExcelChart(chart(type, [NORTH]))).toBeNull();
      expect(isSupportedExcelChartType(type)).toBe(false);
      expect(excelChartTypeName(type)).toBe(name);
      expect(warned()).toContain(`is a ${name} chart, which MAIDR cannot read`);
    });

    it('reads every type it says it reads', () => {
      const supported = ['ColumnClustered', 'BarStacked100', 'Line', 'LineMarkers', 'Area', 'AreaStacked', 'Pie', 'Doughnut', 'XYScatter', 'XYScatterSmooth', 'Radar', 'Funnel', 'StockOHLC', '3DPie', 'ConeCol'];

      expect(supported.filter(type => !isSupportedExcelChartType(type))).toEqual([]);
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

  it('a scatter announces its points by x', () => {
    const points = { name: 'S', xValues: ['1', '2'], yValues: ['10', '20'] };
    const texts = announce(convert(chart('XYScatter', [points])), [right, right]);

    // A column of a scatter can hold several points, so y is read as a list.
    expect(texts.map(text => [text.main.value, text.cross?.value])).toEqual([[1, [10]], [2, [20]]]);
  });
});
