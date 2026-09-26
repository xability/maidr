/**
 * @jest-environment jsdom
 */

import type { PowerBIConversion, PowerBINavigateInfo } from '@adapters/powerbi/converter';
import type {
  PowerBIAdapterOptions,
  PowerBIDataPointRef,
  PowerBIDataView,
  PowerBIMetadataColumn,
  PowerBIPrimitiveValue,
  PowerBIValueColumn,
  PowerBIValueColumns,
} from '@adapters/powerbi/types';
import type {
  BarPoint,
  LinePoint,
  MaidrLayer,
  NavigateCallback,
  SegmentedPoint,
} from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { TextState, TraceState } from '@type/state';
import {
  BLANK_LABEL,
  convertPowerBIDataView,
  resolvePowerBIDataPoints,
  toCategoryKey,
  toFiniteNumber,
} from '@adapters/powerbi/converter';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { Orientation, TraceType } from '@type/grammar';
import { createNavigateObserver } from '@util/navigateObserver';
import { resolveSubplotLayout } from '@util/subplotLayout';

/**
 * The Power BI converter: a `DataView` in, a MAIDR figure and a ref index out.
 *
 * Every data view here is plain JSON in the shape a custom visual's `update()`
 * receives — `categorical.categories[0]`, a `values` array that carries the
 * series field in its own `source` and the series value in each column's
 * `source.groupName`, or a `table` of `columns` and `rows` — because that is
 * all the adapter reads, and a fixture a real `DataView` would not match is a
 * test of nothing.
 *
 * The second half does not trust the index to itself. It builds MAIDR's real
 * model from the converted figure, registers the same navigate observer the
 * controller registers, drives the cursor the way keypresses do, and checks
 * that every position `onNavigate` reports resolves to the data point MAIDR
 * is announcing at that moment. A `[row][col]` that is right by construction
 * and wrong against the trace is exactly the bug this guards.
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REGION: PowerBIMetadataColumn = {
  displayName: 'Region',
  queryName: 'Geo.Region',
  roles: { category: true },
  type: { text: true },
};
const YEAR: PowerBIMetadataColumn = {
  displayName: 'Year',
  queryName: 'Date.Year',
  roles: { series: true },
  type: { text: true },
};
const REGIONS = ['North', 'South', 'East', 'West'];

function sales(groupName?: PowerBIPrimitiveValue): PowerBIMetadataColumn {
  return {
    displayName: 'Sales',
    queryName: 'Sum(Orders.Sales)',
    roles: { measure: true },
    isMeasure: true,
    type: { numeric: true },
    ...(groupName === undefined ? {} : { groupName }),
  };
}

function measure(displayName: string, roles: Record<string, boolean>, groupName?: string): PowerBIMetadataColumn {
  return {
    displayName,
    queryName: `Sum(Orders.${displayName})`,
    roles,
    isMeasure: true,
    type: { numeric: true },
    ...(groupName === undefined ? {} : { groupName }),
  };
}

/** A `DataViewValueColumns`: an array with the series field on it. */
function valueColumns(columns: PowerBIValueColumn[], source?: PowerBIMetadataColumn): PowerBIValueColumns {
  return source === undefined ? columns : Object.assign(columns, { source });
}

function categorical(
  categoryValues: PowerBIPrimitiveValue[] | null,
  values: PowerBIValueColumns,
  category: PowerBIMetadataColumn = REGION,
): PowerBIDataView {
  return {
    categorical: {
      ...(categoryValues === null ? {} : { categories: [{ source: category, values: categoryValues }] }),
      values,
    },
  };
}

/** Sales by region, one measure, no legend. */
function singleSeries(values: PowerBIPrimitiveValue[] = [120, 80, 150, 60]): PowerBIDataView {
  return categorical(REGIONS, valueColumns([{ source: sales(), values }]));
}

/**
 * Sales by region, grouped by year. 2024 has no reading for East — a blank,
 * as Power BI hands one over — so the segmented grid needs a gap.
 */
function byYear(): PowerBIDataView {
  return categorical(REGIONS, valueColumns([
    { source: sales('2023'), values: [10, 20, 30, 40] },
    { source: sales('2024'), values: [11, 21, null, 41] },
    { source: sales('2025'), values: [12, 22, 32, 42] },
  ], YEAR));
}

/** The same data as a table data view, in long form, East/2024 absent. */
function byYearTable(): PowerBIDataView {
  const rows: PowerBIPrimitiveValue[][] = [];
  const grid = [[10, 20, 30, 40], [11, 21, null, 41], [12, 22, 32, 42]];
  ['2023', '2024', '2025'].forEach((year, s) => {
    REGIONS.forEach((region, c) => {
      if (grid[s][c] !== null) {
        rows.push([region, year, grid[s][c]]);
      }
    });
  });
  return { table: { columns: [REGION, YEAR, sales()], rows } };
}

const STORE: PowerBIMetadataColumn = { displayName: 'Store', roles: { category: true }, type: { text: true } };
const SEGMENT: PowerBIMetadataColumn = { displayName: 'Segment', roles: { series: true }, type: { text: true } };

/** Profit against units by store; b and d share x = 5. */
function scatter(): PowerBIDataView {
  return categorical(['a', 'b', 'c', 'd', 'e'], valueColumns([
    { source: measure('Profit', { x: true }), values: [1, 5, 3, 5, null] },
    { source: measure('Units', { y: true }), values: [10, 20, 30, 40, 50] },
  ]), STORE);
}

/** The same stores split by segment: every group spans every category. */
function scatterByLegend(): PowerBIDataView {
  return categorical(['a', 'b', 'c', 'd'], valueColumns([
    { source: measure('Profit', { x: true }, 'Retail'), values: [1, 2, null, null] },
    { source: measure('Units', { y: true }, 'Retail'), values: [10, 20, null, null] },
    { source: measure('Profit', { x: true }, 'Wholesale'), values: [null, null, 3, 4] },
    { source: measure('Units', { y: true }, 'Wholesale'), values: [null, null, 30, 40] },
  ], SEGMENT), STORE);
}

function convert(dataView: PowerBIDataView | undefined, options: PowerBIAdapterOptions): PowerBIConversion {
  const conversion = convertPowerBIDataView(dataView, { id: 'pbi', ...options });
  if (conversion === null) {
    throw new Error('expected a conversion');
  }
  return conversion;
}

function onlyLayer(conversion: PowerBIConversion): MaidrLayer {
  const layers = conversion.maidr.subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

function cat(categoryIndex: number | null, valueColumnIndex: number | null): PowerBIDataPointRef {
  return { kind: 'categorical', categoryIndex, valueColumnIndex };
}
const row = (rowIndex: number): PowerBIDataPointRef => ({ kind: 'table', rowIndex });

let warn: ReturnType<typeof jest.spyOn>;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Value readers
// ---------------------------------------------------------------------------

describe('value readers', () => {
  it('reads a blank measure as a gap, never as zero', () => {
    expect(toFiniteNumber(null)).toBeNull();
    expect(toFiniteNumber(undefined)).toBeNull();
    expect(toFiniteNumber('')).toBeNull();
    expect(toFiniteNumber('  ')).toBeNull();
    expect(toFiniteNumber(Number.NaN)).toBeNull();
    expect(toFiniteNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toFiniteNumber('n/a')).toBeNull();
    expect(toFiniteNumber(true)).toBeNull();
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber('12.5')).toBe(12.5);
  });

  it('labels categories the way Power BI shows them', () => {
    expect(toCategoryKey(new Date(2024, 0, 5))).toBe('2024-01-05');
    expect(toCategoryKey(new Date(2024, 11, 31, 9, 30))).toBe('2024-12-31 09:30');
    expect(toCategoryKey(new Date(Number.NaN))).toBe(BLANK_LABEL);
    expect(toCategoryKey(null)).toBe(BLANK_LABEL);
    expect(toCategoryKey(undefined)).toBe(BLANK_LABEL);
    expect(toCategoryKey('')).toBe(BLANK_LABEL);
    expect(toCategoryKey(2024)).toBe(2024);
    expect(toCategoryKey(true)).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

describe('convertPowerBIDataView', () => {
  describe('returns null when there is nothing to navigate', () => {
    it.each([
      ['no data view', undefined],
      ['an empty data view', {}],
      ['no value columns', { categorical: { categories: [{ source: REGION, values: REGIONS }] } }],
      ['empty value columns', categorical(REGIONS, valueColumns([]))],
      ['no categories and no rows', categorical([], valueColumns([{ source: sales(), values: [] }]))],
      ['a table with no rows', { table: { columns: [REGION, sales()], rows: [] } }],
      ['a table with no measure', { table: { columns: [REGION], rows: [['North']] } }],
      ['every reading blank', singleSeries([null, '', undefined, null])],
    ])('%s', (_, dataView) => {
      expect(convertPowerBIDataView(dataView as PowerBIDataView | undefined, { chartType: 'column' })).toBeNull();
    });

    it('a line with every reading blank', () => {
      expect(convertPowerBIDataView(singleSeries([null, null, null, null]), { chartType: 'line' })).toBeNull();
    });

    it('a pie with no positive slice', () => {
      expect(convertPowerBIDataView(singleSeries([0, -1, null, 0]), { chartType: 'pie' })).toBeNull();
    });

    it('an unsupported chart type', () => {
      expect(convertPowerBIDataView(singleSeries(), { chartType: 'area' as never })).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('unsupported chart type "area"'));
    });
  });

  describe('figure metadata', () => {
    it('carries title, subtitle and caption, and the id', () => {
      const conversion = convert(singleSeries(), {
        chartType: 'column',
        title: 'Sales by region',
        subtitle: 'FY24',
        caption: 'Source: ERP',
        id: 'my-visual',
      });
      expect(conversion.maidr).toMatchObject({
        id: 'my-visual',
        title: 'Sales by region',
        subtitle: 'FY24',
        caption: 'Source: ERP',
      });
      expect(onlyLayer(conversion).title).toBe('Sales by region');
    });

    it('generates a unique id when none is given', () => {
      const a = convertPowerBIDataView(singleSeries(), { chartType: 'column' });
      const b = convertPowerBIDataView(singleSeries(), { chartType: 'column' });
      expect(a?.maidr.id).toMatch(/^maidr-powerbi-\d+$/);
      expect(a?.maidr.id).not.toBe(b?.maidr.id);
    });

    it('lets axis labels be overridden', () => {
      const layer = onlyLayer(convert(singleSeries(), { chartType: 'column', axes: { x: 'Where', y: 'How much' } }));
      expect(layer.axes).toEqual({ x: { label: 'Where' }, y: { label: 'How much' } });
    });
  });

  describe('column and bar', () => {
    it('makes a vertical bar layer from one measure', () => {
      const conversion = convert(singleSeries(), { chartType: 'column' });
      const layer = onlyLayer(conversion);
      expect(layer).toMatchObject({
        id: '0',
        type: TraceType.BAR,
        orientation: Orientation.VERTICAL,
        axes: { x: { label: 'Region' }, y: { label: 'Sales' } },
      });
      expect(layer.data).toEqual([
        { x: 'North', y: 120 },
        { x: 'South', y: 80 },
        { x: 'East', y: 150 },
        { x: 'West', y: 60 },
      ]);
      expect(conversion.cells.get('0')).toEqual([[cat(0, 0), cat(1, 0), cat(2, 0), cat(3, 0)]]);
      expect(conversion.points.size).toBe(0);
    });

    it('makes a horizontal bar layer, magnitude in x', () => {
      const layer = onlyLayer(convert(singleSeries(), { chartType: 'bar' }));
      expect(layer.orientation).toBe(Orientation.HORIZONTAL);
      expect(layer.axes).toEqual({ x: { label: 'Sales' }, y: { label: 'Region' } });
      expect((layer.data as BarPoint[])[0]).toEqual({ x: 120, y: 'North' });
    });

    it('skips a blank bar and keeps the refs aligned with the data', () => {
      const conversion = convert(singleSeries([120, null, '150', 'oops']), { chartType: 'column' });
      expect(onlyLayer(conversion).data).toEqual([{ x: 'North', y: 120 }, { x: 'East', y: 150 }]);
      expect(conversion.cells.get('0')).toEqual([[cat(0, 0), cat(2, 0)]]);
    });

    it('labels blank and date categories', () => {
      const conversion = convert(
        categorical(
          [new Date(2024, 0, 1), null, new Date(2024, 2, 1)],
          valueColumns([{ source: sales(), values: [1, 2, 3] }]),
          { displayName: 'Month', roles: { category: true }, type: { dateTime: true } },
        ),
        { chartType: 'column' },
      );
      expect((onlyLayer(conversion).data as BarPoint[]).map(p => p.x)).toEqual(['2024-01-01', BLANK_LABEL, '2024-03-01']);
    });

    it('keeps a numeric category numeric', () => {
      const conversion = convert(
        categorical([2021, 2022], valueColumns([{ source: sales(), values: [1, 2] }]), {
          displayName: 'Fiscal year',
          roles: { category: true },
          type: { numeric: true },
        }),
        { chartType: 'column' },
      );
      expect(onlyLayer(conversion).data).toEqual([{ x: 2021, y: 1 }, { x: 2022, y: 2 }]);
    });

    it('reads a series-grouped view as a dodged bar by default', () => {
      const conversion = convert(byYear(), { chartType: 'column' });
      const layer = onlyLayer(conversion);
      expect(layer.type).toBe(TraceType.DODGED);
      expect(layer.axes).toEqual({ x: { label: 'Region' }, y: { label: 'Sales' }, z: { label: 'Year' } });
      const data = layer.data as SegmentedPoint[][];
      expect(data).toHaveLength(3);
      expect(data[0][0]).toEqual({ x: 'North', y: 10, z: '2023' });
      expect(data[1][2].x).toBe('East');
      expect(data[1][2].y).toBeNaN();
      expect(data[1][2].z).toBe('2024');
      expect(conversion.maidr.subplots[0][0].legend).toEqual(['2023', '2024', '2025']);
      const cells = conversion.cells.get('0');
      expect(cells?.[0]).toEqual([cat(0, 0), cat(1, 0), cat(2, 0), cat(3, 0)]);
      expect(cells?.[1]).toEqual([cat(0, 1), cat(1, 1), null, cat(3, 1)]);
      expect(cells?.[2][3]).toEqual(cat(3, 2));
    });

    it('reads stacked mode as a stacked bar', () => {
      const layer = onlyLayer(convert(byYear(), { chartType: 'bar', barMode: 'stacked' }));
      expect(layer.type).toBe(TraceType.STACKED);
      expect(layer.orientation).toBe(Orientation.HORIZONTAL);
      expect((layer.data as SegmentedPoint[][])[2][1]).toEqual({ x: 22, y: 'South', z: '2025' });
      expect(layer.axes).toEqual({ x: { label: 'Sales' }, y: { label: 'Region' }, z: { label: 'Year' } });
    });

    it('reads several measures without a legend as one series each', () => {
      const conversion = convert(
        categorical(REGIONS, valueColumns([
          { source: measure('Sales', { measure: true }), values: [1, 2, 3, 4] },
          { source: measure('Profit', { measure: true }), values: [5, 6, 7, 8] },
        ])),
        { chartType: 'column' },
      );
      const layer = onlyLayer(conversion);
      expect(layer.type).toBe(TraceType.DODGED);
      // The measures differ, so no single y label fits.
      expect(layer.axes).toEqual({ x: { label: 'Region' } });
      expect((layer.data as SegmentedPoint[][])[1][0]).toEqual({ x: 'North', y: 5, z: 'Profit' });
      expect(conversion.maidr.subplots[0][0].legend).toEqual(['Sales', 'Profit']);
      expect(conversion.cells.get('0')?.[1][3]).toEqual(cat(3, 1));
    });

    it('ignores a measure column not bound to the measure role', () => {
      const conversion = convert(
        categorical(REGIONS, valueColumns([
          { source: measure('Tooltip', { tooltips: true }), values: [9, 9, 9, 9] },
          { source: measure('Sales', { measure: true }), values: [1, 2, 3, 4] },
        ])),
        { chartType: 'column' },
      );
      const layer = onlyLayer(conversion);
      expect(layer.type).toBe(TraceType.BAR);
      expect(conversion.cells.get('0')?.[0][0]).toEqual(cat(0, 1));
    });

    it('draws one bar per series when there is no category', () => {
      const conversion = convert(
        categorical(null, valueColumns([
          { source: sales('2023'), values: [100] },
          { source: sales('2024'), values: [null] },
          { source: sales('2025'), values: [120] },
        ], YEAR)),
        { chartType: 'column' },
      );
      const layer = onlyLayer(conversion);
      expect(layer.type).toBe(TraceType.BAR);
      expect(layer.data).toEqual([{ x: '2023', y: 100 }, { x: '2025', y: 120 }]);
      expect(layer.axes).toEqual({ x: { label: 'Year' }, y: { label: 'Sales' } });
      expect(conversion.cells.get('0')).toEqual([[cat(null, 0), cat(null, 2)]]);
    });

    it('reads the first category field and warns about the rest', () => {
      const dataView: PowerBIDataView = {
        categorical: {
          categories: [
            { source: { displayName: 'Country' }, values: ['US', 'US'] },
            { source: { ...REGION }, values: ['North', 'South'] },
          ],
          values: valueColumns([{ source: sales(), values: [1, 2] }]),
        },
      };
      const layer = onlyLayer(convert(dataView, { chartType: 'column' }));
      // The role wins over position.
      expect((layer.data as BarPoint[]).map(p => p.x)).toEqual(['North', 'South']);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('2 category fields are bound; reading "Region"'));
    });

    it('honours custom role names', () => {
      const dataView = categorical(['a', 'b'], valueColumns([
        { source: measure('Other', { tooltips: true }), values: [0, 0] },
        { source: measure('Amount', { amount: true }), values: [3, 4] },
      ]), { displayName: 'Thing', roles: { axis: true } });
      const conversion = convert(dataView, { chartType: 'column', roles: { category: 'axis', measure: 'amount' } });
      expect(onlyLayer(conversion).data).toEqual([{ x: 'a', y: 3 }, { x: 'b', y: 4 }]);
      expect(conversion.cells.get('0')?.[0]).toEqual([cat(0, 1), cat(1, 1)]);
    });
  });

  describe('table data views', () => {
    it('pivots long rows into series and keeps the source row of each cell', () => {
      const conversion = convert(byYearTable(), { chartType: 'column', barMode: 'stacked' });
      const layer = onlyLayer(conversion);
      expect(layer.type).toBe(TraceType.STACKED);
      const data = layer.data as SegmentedPoint[][];
      expect(data.map(r => r.map(p => p.y))).toEqual([
        [10, 20, 30, 40],
        [11, 21, Number.NaN, 41],
        [12, 22, 32, 42],
      ]);
      // Rows are emitted 2023 North..West, 2024 North, South, West, 2025 ...
      expect(conversion.cells.get('0')).toEqual([
        [row(0), row(1), row(2), row(3)],
        [row(4), row(5), null, row(6)],
        [row(7), row(8), row(9), row(10)],
      ]);
    });

    it('keeps the first row when a (category, series) pair repeats', () => {
      const conversion = convert(
        { table: { columns: [REGION, sales()], rows: [['North', 1], ['South', 2], ['North', 99]] } },
        { chartType: 'column' },
      );
      expect(onlyLayer(conversion).data).toEqual([{ x: 'North', y: 1 }, { x: 'South', y: 2 }]);
      expect(conversion.cells.get('0')).toEqual([[row(0), row(1)]]);
    });

    it('finds the category and measure without roles', () => {
      const conversion = convert(
        {
          table: {
            columns: [{ displayName: 'Units', type: { numeric: true } }, { displayName: 'City', type: { text: true } }],
            rows: [[5, 'Oslo'], [7, 'Bergen']],
          },
        },
        { chartType: 'line' },
      );
      const layer = onlyLayer(conversion);
      expect(layer.type).toBe(TraceType.LINE);
      expect(layer.data).toEqual([[{ x: 'Oslo', y: 5 }, { x: 'Bergen', y: 7 }]]);
      expect(layer.axes).toEqual({ x: { label: 'City' }, y: { label: 'Units' } });
    });
  });

  describe('line', () => {
    it('keeps a gap in place, with no data point behind it', () => {
      const conversion = convert(singleSeries([1, null, 3, '']), { chartType: 'line' });
      const layer = onlyLayer(conversion);
      expect(layer.data).toEqual([[
        { x: 'North', y: 1 },
        { x: 'South', y: null },
        { x: 'East', y: 3 },
        { x: 'West', y: null },
      ]]);
      expect(conversion.cells.get('0')).toEqual([[cat(0, 0), null, cat(2, 0), null]]);
      expect(conversion.maidr.subplots[0][0].legend).toBeUndefined();
    });

    it('draws one named line per series', () => {
      const conversion = convert(byYear(), { chartType: 'line' });
      const layer = onlyLayer(conversion);
      const data = layer.data as LinePoint[][];
      expect(data).toHaveLength(3);
      expect(data[1][2]).toEqual({ x: 'East', y: null, z: '2024' });
      expect(data[2][0]).toEqual({ x: 'North', y: 12, z: '2025' });
      expect(layer.axes).toEqual({ x: { label: 'Region' }, y: { label: 'Sales' }, z: { label: 'Year' } });
      expect(conversion.maidr.subplots[0][0].legend).toEqual(['2023', '2024', '2025']);
      expect(conversion.cells.get('0')?.[1]).toEqual([cat(0, 1), cat(1, 1), null, cat(3, 1)]);
    });

    it('runs along dates', () => {
      const layer = onlyLayer(convert(
        categorical(
          [new Date(2024, 0, 1), new Date(2024, 0, 2)],
          valueColumns([{ source: sales(), values: [1, 2] }]),
          { displayName: 'Day', roles: { category: true }, type: { dateTime: true } },
        ),
        { chartType: 'line' },
      ));
      expect((layer.data as LinePoint[][])[0].map(p => p.x)).toEqual(['2024-01-01', '2024-01-02']);
    });

    it('needs a category', () => {
      expect(convertPowerBIDataView(
        categorical(null, valueColumns([{ source: sales(), values: [1] }])),
        { chartType: 'line' },
      )).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('a line needs a category field'));
    });
  });

  describe('pie and donut', () => {
    it('makes one slice per category, skipping blank, zero and negative', () => {
      const conversion = convert(singleSeries([30, 0, -5, 70]), { chartType: 'donut' });
      const layer = onlyLayer(conversion);
      expect(layer.type).toBe(TraceType.PIE);
      expect(layer.data).toEqual([{ x: 'North', y: 30 }, { x: 'West', y: 70 }]);
      expect(layer.axes).toEqual({ x: { label: 'Region' }, y: { label: 'Sales' } });
      expect(conversion.cells.get('0')).toEqual([[cat(0, 0), cat(3, 0)]]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('1 negative value(s)'));
    });

    it('reads the first series of a grouped view, and says so', () => {
      const conversion = convert(byYear(), { chartType: 'pie' });
      expect(onlyLayer(conversion).data).toEqual([
        { x: 'North', y: 10 },
        { x: 'South', y: 20 },
        { x: 'East', y: 30 },
        { x: 'West', y: 40 },
      ]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('reading "2023" and ignoring 2 more'));
    });

    it('makes a slice per series when there is no category', () => {
      const conversion = convert(
        categorical(null, valueColumns([
          { source: sales('Online'), values: [60] },
          { source: sales('Store'), values: [40] },
        ], { displayName: 'Channel', roles: { series: true } })),
        { chartType: 'pie' },
      );
      const layer = onlyLayer(conversion);
      expect(layer.data).toEqual([{ x: 'Online', y: 60 }, { x: 'Store', y: 40 }]);
      expect(layer.axes).toEqual({ x: { label: 'Channel' }, y: { label: 'Sales' } });
      expect(conversion.cells.get('0')).toEqual([[cat(null, 0), cat(null, 1)]]);
    });

    it('makes a slice per measure when there is neither category nor legend', () => {
      const conversion = convert(
        categorical(null, valueColumns([
          { source: measure('Won', { measure: true }), values: [3] },
          { source: measure('Lost', { measure: true }), values: [1] },
        ])),
        { chartType: 'pie' },
      );
      expect(onlyLayer(conversion).data).toEqual([{ x: 'Won', y: 3 }, { x: 'Lost', y: 1 }]);
    });
  });

  describe('scatter', () => {
    it('places each category by the x and y roles and labels it', () => {
      const conversion = convert(scatter(), { chartType: 'scatter' });
      const layer = onlyLayer(conversion);
      expect(layer.type).toBe(TraceType.SCATTER);
      expect(layer.axes).toEqual({ x: { label: 'Profit' }, y: { label: 'Units' } });
      // Store e has no x, so there is nowhere to put it.
      expect(layer.data).toEqual([
        { x: 1, y: 10, label: 'a' },
        { x: 5, y: 20, label: 'b' },
        { x: 3, y: 30, label: 'c' },
        { x: 5, y: 40, label: 'd' },
      ]);
      expect(conversion.points.get('0')).toEqual([cat(0, 0), cat(1, 0), cat(2, 0), cat(3, 0)]);
      expect(conversion.cells.size).toBe(0);
    });

    it('finds x and y by role, whatever order the columns come in', () => {
      const conversion = convert(
        categorical(['a'], valueColumns([
          { source: measure('Units', { y: true }), values: [10] },
          { source: measure('Profit', { x: true }), values: [1] },
        ]), STORE),
        { chartType: 'scatter' },
      );
      expect(onlyLayer(conversion).data).toEqual([{ x: 1, y: 10, label: 'a' }]);
      expect(conversion.points.get('0')).toEqual([cat(0, 1)]);
    });

    it('falls back to the first two measures', () => {
      const conversion = convert(
        { table: { columns: [{ displayName: 'P', isMeasure: true }, { displayName: 'Q', isMeasure: true }], rows: [[1, 2], [3, 4]] } },
        { chartType: 'scatter' },
      );
      expect(onlyLayer(conversion).data).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
      expect(conversion.points.get('0')).toEqual([row(0), row(1)]);
    });

    it('builds one named layer per legend value', () => {
      const conversion = convert(scatterByLegend(), { chartType: 'scatter' });
      const layers = conversion.maidr.subplots[0][0].layers;
      expect(layers.map(l => [l.id, l.name])).toEqual([['0', 'Retail'], ['1', 'Wholesale']]);
      expect(layers[0].data).toEqual([{ x: 1, y: 10, label: 'a' }, { x: 2, y: 20, label: 'b' }]);
      expect(layers[1].data).toEqual([{ x: 3, y: 30, label: 'c' }, { x: 4, y: 40, label: 'd' }]);
      expect(conversion.maidr.subplots[0][0].legend).toEqual(['Retail', 'Wholesale']);
      expect(conversion.points.get('0')).toEqual([cat(0, 0), cat(1, 0)]);
      expect(conversion.points.get('1')).toEqual([cat(2, 2), cat(3, 2)]);
    });

    it('needs two measures', () => {
      expect(convertPowerBIDataView(singleSeries(), { chartType: 'scatter' })).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('a scatter needs two measures'));
    });
  });
});

// ---------------------------------------------------------------------------
// resolvePowerBIDataPoints, directly
// ---------------------------------------------------------------------------

describe('resolvePowerBIDataPoints', () => {
  it('resolves a grid cell, and nothing for a gap or out of range', () => {
    const conversion = convert(byYear(), { chartType: 'column' });
    expect(resolvePowerBIDataPoints(conversion, { layerId: '0', row: 2, col: 1 })).toEqual([cat(1, 2)]);
    expect(resolvePowerBIDataPoints(conversion, { layerId: '0', row: 1, col: 2 })).toEqual([]);
    expect(resolvePowerBIDataPoints(conversion, { layerId: '0', row: 0, col: 9 })).toEqual([]);
    expect(resolvePowerBIDataPoints(conversion, { layerId: '0', row: 4, col: 0 })).toEqual([]);
    expect(resolvePowerBIDataPoints(conversion, { layerId: 'nope', row: 0, col: 0 })).toEqual([]);
  });

  it('resolves a segmented summary row to every segment of the category', () => {
    const conversion = convert(byYear(), { chartType: 'column', barMode: 'stacked' });
    expect(resolvePowerBIDataPoints(conversion, { layerId: '0', row: 3, col: 0 }))
      .toEqual([cat(0, 0), cat(0, 1), cat(0, 2)]);
    // The gap has no data point to add.
    expect(resolvePowerBIDataPoints(conversion, { layerId: '0', row: 3, col: 2 }))
      .toEqual([cat(2, 0), cat(2, 2)]);
  });

  it('does not invent a summary row for a plain bar or a line', () => {
    const bar = convert(singleSeries(), { chartType: 'column' });
    expect(resolvePowerBIDataPoints(bar, { layerId: '0', row: 1, col: 0 })).toEqual([]);
    const line = convert(byYear(), { chartType: 'line' });
    expect(resolvePowerBIDataPoints(line, { layerId: '0', row: 3, col: 0 })).toEqual([]);
  });

  it('resolves point indices for a scatter and ignores the braille pair', () => {
    const conversion = convert(scatter(), { chartType: 'scatter' });
    expect(resolvePowerBIDataPoints(conversion, { layerId: '0', row: -1, col: -1, pointIndices: [1, 3] }))
      .toEqual([cat(1, 0), cat(3, 0)]);
    expect(resolvePowerBIDataPoints(conversion, { layerId: '0', row: 0, col: 0 })).toEqual([]);
    expect(resolvePowerBIDataPoints(conversion, { layerId: '0', row: -1, col: -1, pointIndices: [7] })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Agreement with MAIDR's model
// ---------------------------------------------------------------------------

/** One navigation step as the visual would see it. */
interface Step {
  readonly info: PowerBINavigateInfo;
  readonly text: TextState;
  readonly refs: PowerBIDataPointRef[];
}

/**
 * Build MAIDR's real figure from a conversion and wire it the way
 * `Controller.registerNavigateCallback` does.
 */
function mount(conversion: PowerBIConversion): { context: Context; steps: Step[] } {
  const figure = new Figure(conversion.maidr);
  figure.applyLayout(resolveSubplotLayout(figure.subplots));
  const context = new Context(figure);
  const steps: Step[] = [];
  let text: TextState | null = null;
  figure.subplots.forEach(r => r.forEach(subplot => subplot.traces.forEach(traceRow => traceRow.forEach((trace) => {
    // Registered first, so the announcement is captured before the navigate
    // event that reports it.
    trace.addObserver({
      update: (state: TraceState): void => {
        text = !state.empty && state.type === 'trace' ? state.text : null;
      },
    } as never);
    const callback: NavigateCallback = (info) => {
      if (info === null || text === null) {
        return;
      }
      steps.push({ info, text, refs: resolvePowerBIDataPoints(conversion, info) });
    };
    trace.addObserver(createNavigateObserver(trace, callback));
  }))));
  context.enterSubplot();
  return { context, steps };
}

/**
 * Visit every position of the active trace in a snake, the way a reader
 * sweeping with the arrow keys would: along a row, up, back along the next.
 */
function sweep(context: Context): void {
  let along: MovableDirection = 'FORWARD';
  context.moveOnce(along);
  for (;;) {
    while (context.isMovable(along)) {
      context.moveOnce(along);
    }
    if (!context.isMovable('UPWARD')) {
      return;
    }
    context.moveOnce('UPWARD');
    along = along === 'FORWARD' ? 'BACKWARD' : 'FORWARD';
  }
}

/** What a categorical ref names in the data view. */
function readCategorical(dataView: PowerBIDataView, ref: PowerBIDataPointRef): {
  category: string | number | null;
  value: number | null;
  series: string | null;
} {
  if (ref.kind !== 'categorical' || ref.valueColumnIndex === null) {
    throw new Error('expected a categorical ref with a value column');
  }
  const column = dataView.categorical?.values?.[ref.valueColumnIndex];
  const categories = dataView.categorical?.categories?.[0];
  if (column === undefined) {
    throw new Error('ref names no value column');
  }
  const index = ref.categoryIndex ?? 0;
  return {
    category: ref.categoryIndex === null || categories === undefined ? null : toCategoryKey(categories.values[index]),
    value: toFiniteNumber(column.values[index]),
    // Ungrouped, each measure is its own series, named after the measure.
    series: column.source.groupName === undefined ? column.source.displayName : String(column.source.groupName),
  };
}

/** What a table ref names, for the Region / Year / Sales table. */
function readTable(dataView: PowerBIDataView, ref: PowerBIDataPointRef): {
  category: string | number | null;
  value: number | null;
  series: string | null;
} {
  if (ref.kind !== 'table') {
    throw new Error('expected a table ref');
  }
  const cells = dataView.table?.rows?.[ref.rowIndex] ?? [];
  return { category: toCategoryKey(cells[0]), value: toFiniteNumber(cells[2]), series: String(cells[1]) };
}

/**
 * Check that every step of a sweep over a grid layer resolves to the data
 * point announced, and return the positions visited.
 */
function expectGridAgreement(
  dataView: PowerBIDataView,
  conversion: PowerBIConversion,
  steps: readonly Step[],
  read = readCategorical,
): string[] {
  const series = conversion.maidr.subplots[0][0].legend ?? [];
  const seriesRows = conversion.cells.get('0')?.length ?? 0;
  for (const { info, text, refs } of steps) {
    const at = `row ${info.row} col ${info.col}`;
    const announcedZ = text.z === undefined ? null : String(text.z.value);
    if (info.row === seriesRows) {
      // The segmented summary: every segment of the announced category.
      expect({ at, z: announcedZ }).toEqual({ at, z: 'Sum' });
      const named = refs.map(ref => read(dataView, ref));
      expect(named.length).toBeGreaterThan(0);
      named.forEach(point => expect({ at, category: point.category }).toEqual({ at, category: text.main.value }));
      expect({ at, sum: named.reduce((total, point) => total + (point.value ?? 0), 0) })
        .toEqual({ at, sum: text.cross?.value });
      expect(new Set(named.map(point => point.series)).size).toBe(named.length);
      continue;
    }
    const cross = text.cross?.value;
    if (cross === null || (typeof cross === 'number' && Number.isNaN(cross))) {
      // Announced as missing: no mark, so no data point.
      expect({ at, refs }).toEqual({ at, refs: [] });
      continue;
    }
    expect({ at, count: refs.length }).toEqual({ at, count: 1 });
    const point = read(dataView, refs[0]);
    expect({ at, category: point.category, value: point.value })
      .toEqual({ at, category: text.main.value, value: cross });
    if (announcedZ !== null && series.length > 0) {
      expect({ at, series: point.series }).toEqual({ at, series: announcedZ });
    }
  }
  return steps.map(({ info }) => `${info.row},${info.col}`);
}

function allCells(rows: number, cols: number): string[] {
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => `${r},${c}`)).flat();
}

describe('the ref index agrees with what MAIDR announces', () => {
  it('vertical bar', () => {
    const dataView = singleSeries([120, null, 150, 60]);
    const conversion = convert(dataView, { chartType: 'column' });
    const { context, steps } = mount(conversion);
    sweep(context);
    const visited = expectGridAgreement(dataView, conversion, steps);
    expect(new Set(visited)).toEqual(new Set(allCells(1, 3)));
  });

  it('horizontal bar: not reversed, col is the data index', () => {
    const dataView = singleSeries();
    const conversion = convert(dataView, { chartType: 'bar' });
    const { context, steps } = mount(conversion);
    sweep(context);
    expectGridAgreement(dataView, conversion, steps);
    expect(steps.map(s => s.text.main.value)).toEqual(REGIONS);
    expect(steps.map(s => s.info.col)).toEqual([0, 1, 2, 3]);
  });

  it.each([
    ['column', 'grouped'],
    ['column', 'stacked'],
    ['bar', 'grouped'],
    ['bar', 'stacked'],
  ] as ['column' | 'bar', 'grouped' | 'stacked'][])('%s %s: row is the series, col the category, then the summary row', (chartType, barMode) => {
    const dataView = byYear();
    const conversion = convert(dataView, { chartType, barMode });
    const { context, steps } = mount(conversion);
    sweep(context);
    const visited = expectGridAgreement(dataView, conversion, steps);
    // Three series and MAIDR's own sum row, four categories each.
    expect(new Set(visited)).toEqual(new Set(allCells(4, 4)));
    // The gap was reached and announced as missing.
    const gap = steps.find(s => s.info.row === 1 && s.info.col === 2);
    expect(gap?.refs).toEqual([]);
    // The summary over the gap names the two segments that exist.
    const sum = steps.find(s => s.info.row === 3 && s.info.col === 2);
    expect(sum?.refs).toEqual([cat(2, 0), cat(2, 2)]);
  });

  it('stacked bar from a table data view', () => {
    const dataView = byYearTable();
    const conversion = convert(dataView, { chartType: 'column', barMode: 'stacked' });
    const { context, steps } = mount(conversion);
    sweep(context);
    const visited = expectGridAgreement(dataView, conversion, steps, readTable);
    expect(new Set(visited)).toEqual(new Set(allCells(4, 4)));
  });

  it('multi-series line: row is the series, gaps name no data point', () => {
    const dataView = byYear();
    const conversion = convert(dataView, { chartType: 'line' });
    const { context, steps } = mount(conversion);
    sweep(context);
    const visited = expectGridAgreement(dataView, conversion, steps);
    expect(new Set(visited)).toEqual(new Set(allCells(3, 4)));
    expect(steps.find(s => s.info.row === 1 && s.info.col === 2)?.refs).toEqual([]);
  });

  it('multi-measure line without a legend', () => {
    const dataView = categorical(REGIONS, valueColumns([
      { source: measure('Sales', { measure: true }), values: [1, 2, 3, 4] },
      { source: measure('Profit', { measure: true }), values: [5, 6, 7, 8] },
    ]));
    const conversion = convert(dataView, { chartType: 'line' });
    const { context, steps } = mount(conversion);
    sweep(context);
    expectGridAgreement(dataView, conversion, steps);
    const last = steps.at(-1);
    expect(last?.text.z?.value).toBe('Profit');
    expect(last?.refs).toEqual([cat(last?.info.col ?? -1, 1)]);
  });

  it('pie: one row, col is the slice in data order', () => {
    const dataView = singleSeries([30, 0, 20, 50]);
    const conversion = convert(dataView, { chartType: 'pie' });
    const { context, steps } = mount(conversion);
    sweep(context);
    expectGridAgreement(dataView, conversion, steps);
    expect(steps.map(s => [s.info.col, s.text.main.value])).toEqual([[0, 'North'], [1, 'East'], [2, 'West']]);
  });

  it('scatter: pointIndices resolve to the points announced, shared x included', () => {
    const dataView = scatter();
    const conversion = convert(dataView, { chartType: 'scatter' });
    const { context, steps } = mount(conversion);
    for (let i = 0; i < 3; i++) {
      context.moveOnce('FORWARD');
    }
    context.moveOnce('UPWARD');
    context.moveOnce('UPWARD');
    // Three columns by x, then into row mode by y.
    expect(steps.length).toBeGreaterThanOrEqual(4);
    expect(steps.some(s => s.text.main.label === 'Units')).toBe(true);

    const categories = dataView.categorical?.categories?.[0].values ?? [];
    const profit = dataView.categorical?.values?.[0].values ?? [];
    const units = dataView.categorical?.values?.[1].values ?? [];
    for (const { info, text, refs } of steps) {
      expect(info.pointIndices?.length).toBeGreaterThan(0);
      expect(refs).toHaveLength(info.pointIndices?.length ?? -1);
      const xs = refs.map(ref => ref.kind === 'categorical' ? profit[ref.categoryIndex ?? -1] : null);
      const ys = refs.map(ref => ref.kind === 'categorical' ? units[ref.categoryIndex ?? -1] : null);
      // Column mode announces x then every y there; row mode the reverse.
      const [main, cross] = text.main.label === 'Profit' ? [xs, ys] : [ys, xs];
      main.forEach(value => expect(value).toBe(text.main.value));
      expect(cross).toEqual([text.cross?.value].flat());
    }
    // x = 5 is shared by stores b and d, which are read together.
    const shared = steps.find(s => s.text.main.label === 'Profit' && s.text.main.value === 5);
    expect(shared?.refs).toEqual([cat(1, 0), cat(3, 0)]);
    expect(shared?.refs.map(ref => ref.kind === 'categorical' ? categories[ref.categoryIndex ?? -1] : null))
      .toEqual(['b', 'd']);
  });

  it('scatter with a legend: each layer resolves against its own points', () => {
    const dataView = scatterByLegend();
    const conversion = convert(dataView, { chartType: 'scatter' });
    const { context, steps } = mount(conversion);
    context.moveOnce('FORWARD');
    context.moveOnce('FORWARD');
    context.stepTrace('UPWARD');
    context.moveOnce('FORWARD');

    const byLayer = new Map<string, Step[]>();
    steps.forEach(step => byLayer.set(step.info.layerId, [...(byLayer.get(step.info.layerId) ?? []), step]));
    expect([...byLayer.keys()].sort()).toEqual(['0', '1']);

    const profit = (ref: PowerBIDataPointRef): PowerBIPrimitiveValue =>
      ref.kind === 'categorical' ? dataView.categorical?.values?.[ref.valueColumnIndex ?? -1].values[ref.categoryIndex ?? -1] : null;
    for (const { text, refs } of steps.filter(s => s.text.main.label === 'Profit')) {
      expect(refs).toHaveLength(1);
      expect(profit(refs[0])).toBe(text.main.value);
    }
    // Every Wholesale step names a Wholesale column.
    for (const { refs } of byLayer.get('1') ?? []) {
      refs.forEach(ref => expect(ref.kind === 'categorical' && ref.valueColumnIndex).toBe(2));
    }
  });
});
