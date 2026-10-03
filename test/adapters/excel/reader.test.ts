import type { ExcelReadOptions } from '@adapters/excel/reader';
import type { ExcelChart, ExcelChartSnapshot, ExcelRequestContext } from '@adapters/excel/types';
import type { FakeBook, FakeChartData } from './fakeOffice';
import { convertExcelChart } from '@adapters/excel/converter';
import {
  columnLetters,
  findExcelCharts,
  joinLabelLevels,
  listExcelCharts,
  parseRangeAddress,
  readExcelChart,
} from '@adapters/excel/reader';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { FakeExcelHost } from './fakeOffice';

/**
 * The Excel reader: a live chart in, through Office.js's load-and-sync
 * protocol, a plain snapshot out.
 *
 * The fake host is strict where Office.js is strict -- a property is readable
 * only once loaded and synced, a method's result only after the sync that
 * follows it -- so every test here also checks that the reader never reads
 * before it syncs. The sync counts pin the batching: one round trip per step
 * that needs the one before it, and optional reads (axis titles, category
 * cells, the image) each in a sync of their own so that losing one never
 * loses the chart.
 */

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

const SALES: FakeChartData = {
  id: '{chart-1}',
  name: 'Chart 1',
  chartType: 'ColumnClustered',
  title: { text: 'Sales by quarter', visible: true },
  axes: {
    category: { text: 'Quarter', visible: true },
    value: { text: 'Axis Title', visible: false },
  },
  series: [
    {
      name: 'North',
      chartType: 'ColumnClustered',
      categories: ['Q1', 'Q2', 'Q3'],
      values: ['120', '135', ''],
      categorySource: { type: 'LocalRange', address: 'Sales!$A$2:$A$4' },
    },
    { name: 'South', chartType: 'ColumnClustered', categories: ['Q1', 'Q2', 'Q3'], values: ['90', '110', '95'] },
  ],
};

function book(charts: FakeChartData[] = [SALES]): FakeBook {
  return {
    sheets: [{
      id: '{sheet-1}',
      name: 'Sales',
      charts,
      cells: { A1: 'Quarter', A2: 'Q1', A3: 'Q2', A4: 'Q3' },
    }],
  };
}

/** Read the first chart on the first sheet of a book. */
async function read(data: FakeBook, options?: ExcelReadOptions): Promise<{ snapshot: ExcelChartSnapshot; host: FakeExcelHost }> {
  const host = new FakeExcelHost(data);
  const snapshot = await host.run(async (context: ExcelRequestContext) => {
    const sheet = context.workbook.worksheets.getItemOrNullObject(data.sheets[0].name);
    sheet.charts.load('items/id');
    await context.sync();
    const chart: ExcelChart = sheet.charts.items[0];
    host.syncs = 0;
    return readExcelChart(context, chart, options);
  });
  return { snapshot, host };
}

describe('readExcelChart', () => {
  it('reads the chart, its titles and every series\' categories and values', async () => {
    const { snapshot } = await read(book());

    expect(snapshot).toEqual({
      id: '{chart-1}',
      name: 'Chart 1',
      worksheet: 'Sales',
      chartType: 'ColumnClustered',
      title: { text: 'Sales by quarter', visible: true },
      axes: {
        category: { title: { text: 'Quarter', visible: true } },
        value: { title: { text: 'Axis Title', visible: false } },
      },
      series: [
        {
          name: 'North',
          chartType: 'ColumnClustered',
          filtered: false,
          axisGroup: 'Primary',
          categories: ['Q1', 'Q2', 'Q3'],
          values: ['120', '135', ''],
        },
        {
          name: 'South',
          chartType: 'ColumnClustered',
          filtered: false,
          axisGroup: 'Primary',
          categories: ['Q1', 'Q2', 'Q3'],
          values: ['90', '110', '95'],
        },
      ],
    });
  });

  it('reads in three round trips: the chart, the values, the axis titles', async () => {
    const { host } = await read(book());

    // Excel.run's own closing sync is the fourth.
    expect(host.syncs).toBe(4);
  });

  it('converts into the figure the chart draws', async () => {
    const { snapshot } = await read(book());

    const maidr = convertExcelChart(snapshot, { id: 'read' });

    expect(maidr?.title).toBe('Sales by quarter');
    expect(maidr?.subplots[0][0].layers[0]).toMatchObject({
      type: TraceType.DODGED,
      axes: { x: { label: 'Quarter' } },
    });
  });

  it('reads a scatter\'s X and Y values, not categories', async () => {
    const scatter: FakeChartData = {
      id: '{s}',
      name: 'Scatter',
      chartType: 'XYScatter',
      series: [{ name: 'Height', xValues: ['1', '2'], yValues: ['10', '20'], categories: ['should not be read'] }],
    };

    const { snapshot } = await read(book([scatter]));

    expect(snapshot.series[0]).toEqual({
      name: 'Height',
      filtered: false,
      axisGroup: 'Primary',
      xValues: ['1', '2'],
      yValues: ['10', '20'],
    });
  });

  it('asks a pie for no axes, and reads where its first slice starts', async () => {
    const pie: FakeChartData = {
      id: '{p}',
      name: 'Pie',
      chartType: 'Pie',
      // Asking this chart for an axis title fails the sync.
      axes: null,
      series: [{ name: 'Share', chartType: 'Pie', firstSliceAngle: 90, categories: ['A', 'B'], values: ['1', '2'] }],
    };

    const { snapshot, host } = await read(book([pie]));

    expect(snapshot.axes).toBeUndefined();
    expect(snapshot.series[0].firstSliceAngle).toBe(90);
    expect(snapshot.series[0].axisGroup).toBeUndefined();
    expect(host.syncs).toBe(3);
    expect(warn).not.toHaveBeenCalled();
  });

  it('reads nothing more of a series MAIDR declines than its name and type', async () => {
    const treemap: FakeChartData = {
      id: '{t}',
      name: 'Treemap',
      chartType: 'Treemap',
      axes: null,
      series: [{ name: 'Sizes', chartType: 'Treemap', categories: ['a'], values: ['1'] }],
    };

    const { snapshot } = await read(book([treemap]));

    expect(snapshot.series).toEqual([{ name: 'Sizes', chartType: 'Treemap' }]);
    expect(snapshot.axes).toBeUndefined();
  });

  it('reads the secondary value axis only when a series is drawn against it', async () => {
    const combo: FakeChartData = {
      ...SALES,
      axes: { ...SALES.axes, secondaryValue: { text: 'Margin', visible: true } },
      series: [SALES.series[0], { ...SALES.series[1], chartType: 'Line', axisGroup: 'Secondary' }],
    };

    const primary = await read(book());
    const secondary = await read(book([combo]));

    expect(primary.snapshot.axes?.secondaryValue).toBeUndefined();
    expect(secondary.snapshot.axes?.secondaryValue).toEqual({ title: { text: 'Margin', visible: true } });
    expect(secondary.snapshot.series[1]).toMatchObject({ chartType: 'Line', axisGroup: 'Secondary' });
  });

  it('keeps reading the chart when its axis titles cannot be read', async () => {
    const { snapshot } = await read(book([{ ...SALES, axes: null }]));

    expect(snapshot.axes).toBeUndefined();
    expect(snapshot.series).toHaveLength(2);
    expect(warned()).toContain('could not read the chart\'s axis titles');
  });

  it('reports a filtered series, and reads no axes for a chart whose only measured series is hidden', async () => {
    const hidden: FakeChartData = { ...SALES, axes: null, series: [{ ...SALES.series[0], filtered: true }] };

    const { snapshot } = await read(book([hidden]));

    expect(snapshot.series[0].filtered).toBe(true);
    expect(snapshot.axes).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('fails the read when the values cannot be read', async () => {
    const host = new FakeExcelHost(book());

    const failing = host.run(async (context) => {
      const sheet = context.workbook.worksheets.getItemOrNullObject('Sales');
      sheet.charts.load('items/id');
      await context.sync();
      host.failSyncs = new Error('GeneralException');
      return readExcelChart(context, sheet.charts.items[0]);
    });

    await expect(failing).rejects.toThrow('GeneralException');
  });

  describe('category cells (ExcelApi 1.15)', () => {
    it('reads the cells\' displayed text and the header above them, in two more round trips', async () => {
      const { snapshot, host } = await read(book(), { categoryCells: true });

      expect(snapshot.categoryLabels).toEqual(['Q1', 'Q2', 'Q3']);
      expect(snapshot.categoryHeader).toBe('Quarter');
      expect(host.syncs).toBe(6);
    });

    it('joins label levels, carrying an outer label down its group', async () => {
      const data = book([{
        ...SALES,
        series: [{ ...SALES.series[0], categorySource: { type: 'LocalRange', address: '\'Sales\'!$A$2:$B$4' } }],
      }]);
      data.sheets[0].cells = { A1: 'Year', B1: 'Quarter', A2: '2024', B2: 'Q3', B3: 'Q4', A4: '2025', B4: 'Q1' };

      const { snapshot } = await read(data, { categoryCells: true });

      expect(snapshot.categoryLabels).toEqual(['2024 Q3', '2024 Q4', '2025 Q1']);
      expect(snapshot.categoryHeader).toBe('Year / Quarter');
    });

    it('reads categories that run across a row, with the header before them', async () => {
      const data = book([{
        ...SALES,
        series: [{ ...SALES.series[0], categorySource: { type: 'LocalRange', address: 'Sales!$B$1:$D$1' } }],
      }]);
      data.sheets[0].cells = { A1: 'Quarter', B1: 'Q1', C1: 'Q2', D1: 'Q3' };

      const { snapshot } = await read(data, { categoryCells: true });

      expect(snapshot.categoryLabels).toEqual(['Q1', 'Q2', 'Q3']);
      expect(snapshot.categoryHeader).toBe('Quarter');
    });

    it('has no header for a range that starts at the top of the sheet', async () => {
      const data = book([{
        ...SALES,
        series: [{ ...SALES.series[0], categorySource: { type: 'LocalRange', address: 'Sales!$A$1:$A$3' } }],
      }]);
      data.sheets[0].cells = { A1: 'Q1', A2: 'Q2', A3: 'Q3' };

      const { snapshot } = await read(data, { categoryCells: true });

      expect(snapshot.categoryLabels).toEqual(['Q1', 'Q2', 'Q3']);
      expect(snapshot.categoryHeader).toBeUndefined();
    });

    it.each([
      ['a list of values', { type: 'List', address: '{"Q1","Q2","Q3"}' }],
      ['another workbook', { type: 'ExternalRange', address: '[Book2]Sales!$A$2:$A$4' }],
      ['a range the categories do not fit', { type: 'LocalRange', address: 'Sales!$A$2:$A$9' }],
    ])('reads no cells for %s', async (_, categorySource) => {
      const { snapshot } = await read(book([{ ...SALES, series: [{ ...SALES.series[0], categorySource }] }]), { categoryCells: true });

      expect(snapshot.categoryLabels).toBeUndefined();
      expect(snapshot.categoryHeader).toBeUndefined();
    });

    it('keeps the chart when the cells cannot be read', async () => {
      const { snapshot } = await read(book([{
        ...SALES,
        series: [{ ...SALES.series[0], categorySource: { type: 'LocalRange', address: 'Gone!$A$2:$A$4' } }],
      }]), { categoryCells: true });

      expect(snapshot.categoryLabels).toBeUndefined();
      expect(snapshot.series[0].values).toEqual(['120', '135', '']);
      expect(warned()).toContain('could not read the category cells');
    });

    it('is not read unless asked for', async () => {
      const { snapshot } = await read(book());

      expect(snapshot.categoryLabels).toBeUndefined();
    });
  });

  describe('the image', () => {
    it('reads the chart as Excel draws it, at the width asked for', async () => {
      const own = await read(book([{ ...SALES, image: 'AAAA' }]), { image: true });
      const scaled = await read(book([{ ...SALES, image: 'AAAA' }]), { image: { width: 320 } });

      expect(own.snapshot.image).toBe('AAAA');
      expect(scaled.snapshot.image).toBe('AAAA#w=320');
    });

    it('keeps the chart when the image cannot be read', async () => {
      const { snapshot } = await read(book([{ ...SALES, image: new Error('GeneralException') }]), { image: true });

      expect(snapshot.image).toBeUndefined();
      expect(snapshot.series).toHaveLength(2);
      expect(warned()).toContain('could not read the chart\'s image');
    });
  });
});

describe('listExcelCharts and findExcelCharts', () => {
  const workbook = (): FakeBook => ({
    activeChartId: '{b}',
    sheets: [
      {
        id: '{s1}',
        name: 'Sales',
        charts: [
          { id: '{a}', name: 'Chart 1', chartType: 'Line', title: { text: 'Revenue', visible: true }, series: [] },
          { id: '{b}', name: 'Chart 2', chartType: 'Pie', title: { text: 'Hidden title', visible: false }, series: [] },
          { id: '{c}', name: 'Chart 3', chartType: 'Line', title: { text: 'Revenue', visible: true }, series: [] },
        ],
      },
      { id: '{s2}', name: 'Scratch', visibility: 'Hidden', charts: [{ id: '{d}', name: 'Chart 1', chartType: 'Line', series: [] }] },
      { id: '{s3}', name: 'Costs', charts: [{ id: '{e}', name: 'Chart 1', chartType: 'Bar', title: { text: ' Costs ', visible: true }, series: [] }] },
    ],
  });

  it('lists every chart on a visible sheet as "Sheet - title", in tab order', async () => {
    const host = new FakeExcelHost(workbook());

    const charts = await host.run(context => listExcelCharts(context));

    expect(charts).toEqual([
      { id: '{a}', name: 'Chart 1', title: 'Revenue', worksheet: 'Sales', worksheetId: '{s1}', label: 'Sales - Revenue' },
      { id: '{b}', name: 'Chart 2', worksheet: 'Sales', worksheetId: '{s1}', label: 'Sales - Chart 2' },
      { id: '{c}', name: 'Chart 3', title: 'Revenue', worksheet: 'Sales', worksheetId: '{s1}', label: 'Sales - Revenue (2)' },
      { id: '{e}', name: 'Chart 1', title: 'Costs', worksheet: 'Costs', worksheetId: '{s3}', label: 'Costs - Costs' },
    ]);
  });

  it('says which chart is active, and that none is', async () => {
    const data = workbook();
    const host = new FakeExcelHost(data);

    const active = await host.run(async context => (await findExcelCharts(context)).activeId);
    data.activeChartId = null;
    const none = await host.run(async context => (await findExcelCharts(context)).activeId);

    expect(active).toBe('{b}');
    expect(none).toBeNull();
  });

  it('hands back charts a read can be made from', async () => {
    const data = workbook();
    data.sheets[0].charts[0].series = [{ name: 'Revenue', categories: ['Q1'], values: ['5'] }];
    const host = new FakeExcelHost(data);

    const snapshot = await host.run(async (context) => {
      const { charts } = await findExcelCharts(context);
      return readExcelChart(context, charts[0].chart);
    });

    expect(snapshot.series[0].values).toEqual(['5']);
  });
});

describe('cell addresses', () => {
  it.each([
    ['Sheet1!$A$2:$A$9', { sheet: 'Sheet1', top: 2, left: 1, bottom: 9, right: 1 }],
    ['=Sheet1!$B$1:$E$1', { sheet: 'Sheet1', top: 1, left: 2, bottom: 1, right: 5 }],
    ['\'Q1 Sales\'!A2:B4', { sheet: 'Q1 Sales', top: 2, left: 1, bottom: 4, right: 2 }],
    ['\'O\'\'Brien\'!$C$3', { sheet: 'O\'Brien', top: 3, left: 3, bottom: 3, right: 3 }],
    ['data!$aa$10:$ab$12', { sheet: 'data', top: 10, left: 27, bottom: 12, right: 28 }],
  ])('parses %s', (text, expected) => {
    expect(parseRangeAddress(text)).toEqual(expected);
  });

  it.each([
    '{"Q1","Q2"}',
    '[Book2]Sheet1!$A$2:$A$9',
    'Sheet1!$A$2:$A$9,Sheet1!$C$2:$C$9',
    '(Sheet1!$A$2:$A$4,Sheet1!$A$6:$A$8)',
    '$A$2:$A$9',
    '',
  ])('declines %s', (text) => {
    expect(parseRangeAddress(text)).toBeNull();
  });

  it.each([[1, 'A'], [26, 'Z'], [27, 'AA'], [28, 'AB'], [702, 'ZZ'], [703, 'AAA']])('writes column %d as %s', (column, letters) => {
    expect(columnLetters(column)).toBe(letters);
  });

  it('joins label levels down rows and across columns', () => {
    expect(joinLabelLevels([['2024', 'Q1'], ['', 'Q2'], ['2025', ' Q1 ']], 'rows')).toEqual(['2024 Q1', '2024 Q2', '2025 Q1']);
    expect(joinLabelLevels([['East', '', 'West'], ['A', 'B', 'C']], 'columns')).toEqual(['East A', 'East B', 'West C']);
    expect(joinLabelLevels([['Q1'], [''], ['Q3']], 'rows')).toEqual(['Q1', '', 'Q3']);
  });
});
