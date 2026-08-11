import type { RechartsAdapterConfig, RechartsSubplotConfig } from '@adapters/recharts/types';
import type { BarPoint, LinePoint } from '@type/grammar';
import { convertRechartsToMaidr, normalizeRechartsSubplotGrid } from '@adapters/recharts/converters';
import { getPanelClassName, getRechartsSelector } from '@adapters/recharts/selectors';
import { TraceType } from '@type/grammar';

const eastData = [
  { quarter: 'Q1', revenue: 100 },
  { quarter: 'Q2', revenue: 200 },
];
const westData = [
  { quarter: 'Q1', revenue: 80 },
  { quarter: 'Q2', revenue: 140 },
];

describe('recharts subplot mode', () => {
  describe('normalizeRechartsSubplotGrid', () => {
    const panel = (title: string): RechartsSubplotConfig => ({ title, chartType: 'bar' });

    it('returns a 2D grid unchanged, allowing ragged rows', () => {
      const grid = [[panel('a'), panel('b')], [panel('c')]];
      expect(normalizeRechartsSubplotGrid(grid)).toBe(grid);
    });

    it('chunks a flat array into rows of `columns` panels', () => {
      const flat = [panel('a'), panel('b'), panel('c')];
      const grid = normalizeRechartsSubplotGrid(flat, 2);

      expect(grid).toHaveLength(2);
      expect(grid[0]).toHaveLength(2);
      expect(grid[1]).toHaveLength(1);
      expect(grid[0][0].title).toBe('a');
      expect(grid[1][0].title).toBe('c');
    });

    it('places a flat array in a single row when columns is omitted', () => {
      const grid = normalizeRechartsSubplotGrid([panel('a'), panel('b'), panel('c')]);

      expect(grid).toHaveLength(1);
      expect(grid[0]).toHaveLength(3);
    });

    it('throws for an empty subplots array', () => {
      expect(() => normalizeRechartsSubplotGrid([])).toThrow('at least one panel');
    });

    it('throws for an empty row in a 2D grid', () => {
      expect(() => normalizeRechartsSubplotGrid([[panel('a')], []])).toThrow('row 1');
    });

    it('throws for a non-positive or fractional columns value', () => {
      expect(() => normalizeRechartsSubplotGrid([panel('a')], 0)).toThrow('columns');
      expect(() => normalizeRechartsSubplotGrid([panel('a')], 1.5)).toThrow('columns');
    });
  });

  describe('convertRechartsToMaidr with subplots', () => {
    it('builds one MaidrSubplot per panel in the same grid shape', () => {
      const config: RechartsAdapterConfig = {
        id: 'facet',
        title: 'Sales by Region',
        xKey: 'quarter',
        yKeys: ['revenue'],
        subplots: [
          [
            { title: 'East', chartType: 'bar', data: eastData },
            { title: 'West', chartType: 'bar', data: westData },
          ],
          [
            { title: 'North', chartType: 'bar', data: eastData },
          ],
        ],
      };

      const result = convertRechartsToMaidr(config);

      expect(result.id).toBe('facet');
      expect(result.title).toBe('Sales by Region');
      expect(result.subplots).toHaveLength(2);
      expect(result.subplots[0]).toHaveLength(2);
      expect(result.subplots[1]).toHaveLength(1);
    });

    it('scopes each panel layer selector to the panel wrapper class', () => {
      const config: RechartsAdapterConfig = {
        id: 'facet',
        xKey: 'quarter',
        yKeys: ['revenue'],
        subplots: [[
          { title: 'East', chartType: 'bar', data: eastData },
          { title: 'West', chartType: 'bar', data: westData },
        ]],
      };

      const result = convertRechartsToMaidr(config);

      expect(result.subplots[0][0].layers[0].selectors)
        .toBe('#maidr-article-facet .maidr-panel-0-0 .recharts-bar-rectangle .recharts-rectangle');
      expect(result.subplots[0][1].layers[0].selectors)
        .toBe('#maidr-article-facet .maidr-panel-0-1 .recharts-bar-rectangle .recharts-rectangle');
    });

    it('sets the subplot container selector to the panel SVG surface', () => {
      const config: RechartsAdapterConfig = {
        id: 'facet',
        xKey: 'quarter',
        yKeys: ['revenue'],
        subplots: [[{ title: 'East', chartType: 'bar', data: eastData }]],
      };

      const result = convertRechartsToMaidr(config);

      expect(result.subplots[0][0].selector)
        .toBe('#maidr-article-facet .maidr-panel-0-0 svg.recharts-surface');
    });

    it('assigns figure-unique layer ids prefixed with the grid position', () => {
      const config: RechartsAdapterConfig = {
        id: 'facet',
        xKey: 'quarter',
        subplots: [[
          { title: 'East', chartType: 'bar', yKeys: ['revenue'], data: eastData },
          {
            title: 'West',
            data: westData,
            layers: [
              { yKey: 'revenue', chartType: 'bar', name: 'Revenue' },
              { yKey: 'revenue', chartType: 'line', name: 'Trend' },
            ],
          },
        ]],
      };

      const result = convertRechartsToMaidr(config);
      const allIds = result.subplots.flat().flatMap(subplot => subplot.layers.map(layer => layer.id));

      expect(result.subplots[0][0].layers[0].id).toBe('0_0_0');
      expect(result.subplots[0][1].layers[0].id).toBe('0_1_0');
      expect(result.subplots[0][1].layers[1].id).toBe('0_1_1');
      expect(new Set(allIds).size).toBe(allIds.length);
    });

    it('puts the panel title on the first layer only', () => {
      const config: RechartsAdapterConfig = {
        id: 'facet',
        xKey: 'quarter',
        subplots: [[{
          title: 'East',
          data: eastData,
          layers: [
            { yKey: 'revenue', chartType: 'bar', name: 'Revenue' },
            { yKey: 'revenue', chartType: 'line', name: 'Trend' },
          ],
        }]],
      };

      const result = convertRechartsToMaidr(config);
      const layers = result.subplots[0][0].layers;

      expect(layers[0].title).toBe('East');
      expect(layers[1].title).toBe('Trend');
    });

    it('merges top-level defaults into each panel', () => {
      const config: RechartsAdapterConfig = {
        id: 'facet',
        data: eastData,
        xKey: 'quarter',
        yKeys: ['revenue'],
        xLabel: 'Quarter',
        yLabel: 'Revenue ($)',
        subplots: [[
          { title: 'Default data', chartType: 'bar' },
          { title: 'Own data', chartType: 'bar', data: westData, yLabel: 'West Revenue' },
        ]],
      };

      const result = convertRechartsToMaidr(config);
      const [first, second] = result.subplots[0];

      expect(first.layers[0].axes?.x).toEqual({ label: 'Quarter' });
      expect(first.layers[0].axes?.y).toEqual({ label: 'Revenue ($)' });
      expect((first.layers[0].data as BarPoint[])[0]).toEqual({ x: 'Q1', y: 100 });

      expect(second.layers[0].axes?.y).toEqual({ label: 'West Revenue' });
      expect((second.layers[0].data as BarPoint[])[0]).toEqual({ x: 'Q1', y: 80 });
    });

    it('supports flat subplots with columns chunking', () => {
      const config: RechartsAdapterConfig = {
        id: 'facet',
        data: eastData,
        xKey: 'quarter',
        yKeys: ['revenue'],
        columns: 2,
        subplots: [
          { title: 'A', chartType: 'bar' },
          { title: 'B', chartType: 'bar' },
          { title: 'C', chartType: 'bar' },
        ],
      };

      const result = convertRechartsToMaidr(config);

      expect(result.subplots).toHaveLength(2);
      expect(result.subplots[0]).toHaveLength(2);
      expect(result.subplots[1]).toHaveLength(1);
      expect(result.subplots[1][0].layers[0].title).toBe('C');
      expect(result.subplots[1][0].layers[0].selectors)
        .toBe('#maidr-article-facet .maidr-panel-1-0 .recharts-bar-rectangle .recharts-rectangle');
    });

    it('honors panelSelector as the panel scope escape hatch', () => {
      const config: RechartsAdapterConfig = {
        id: 'facet',
        data: eastData,
        xKey: 'quarter',
        yKeys: ['revenue'],
        subplots: [[{ title: 'East', chartType: 'bar', panelSelector: '.my-east-panel' }]],
      };

      const result = convertRechartsToMaidr(config);

      expect(result.subplots[0][0].layers[0].selectors)
        .toBe('#maidr-article-facet .my-east-panel .recharts-bar-rectangle .recharts-rectangle');
      expect(result.subplots[0][0].selector)
        .toBe('#maidr-article-facet .my-east-panel svg.recharts-surface');
    });

    it('uses the panel selectorOverride verbatim and does not inherit the top-level one', () => {
      const config: RechartsAdapterConfig = {
        id: 'facet',
        data: eastData,
        xKey: 'quarter',
        yKeys: ['revenue'],
        selectorOverride: '.top-level-override',
        subplots: [[
          { title: 'Own override', chartType: 'bar', selectorOverride: '.east-bars .recharts-rectangle' },
          { title: 'Generated', chartType: 'bar' },
        ]],
      };

      const result = convertRechartsToMaidr(config);

      expect(result.subplots[0][0].layers[0].selectors).toBe('.east-bars .recharts-rectangle');
      expect(result.subplots[0][1].layers[0].selectors)
        .toBe('#maidr-article-facet .maidr-panel-0-1 .recharts-bar-rectangle .recharts-rectangle');
    });

    it('converts mixed panel chart types', () => {
      const config: RechartsAdapterConfig = {
        id: 'facet',
        data: eastData,
        xKey: 'quarter',
        subplots: [[
          { title: 'Bars', chartType: 'bar', yKeys: ['revenue'] },
          { title: 'Lines', chartType: 'line', yKeys: ['revenue'] },
        ]],
      };

      const result = convertRechartsToMaidr(config);
      const [bars, lines] = result.subplots[0];

      expect(bars.layers[0].type).toBe(TraceType.BAR);
      expect(lines.layers[0].type).toBe(TraceType.LINE);
      // Line selectors are wrapped in an array (one per series) and panel-scoped.
      expect(lines.layers[0].selectors)
        .toEqual(['#maidr-article-facet .maidr-panel-0-1 .recharts-line-dots .recharts-line-dot']);
      expect((lines.layers[0].data as LinePoint[][])[0][0]).toEqual({ x: 'Q1', y: 100 });
    });

    it('disables highlighting for multi-series panels (selectors undefined)', () => {
      const config: RechartsAdapterConfig = {
        id: 'facet',
        data: [{ quarter: 'Q1', a: 1, b: 2 }],
        xKey: 'quarter',
        subplots: [[{ title: 'Multi', chartType: 'bar', yKeys: ['a', 'b'] }]],
      };

      const result = convertRechartsToMaidr(config);
      const layers = result.subplots[0][0].layers;

      expect(layers).toHaveLength(2);
      expect(layers[0].selectors).toBeUndefined();
      expect(layers[1].selectors).toBeUndefined();
    });

    it('throws when subplots is combined with top-level chartType', () => {
      const config: RechartsAdapterConfig = {
        id: 'bad',
        data: eastData,
        chartType: 'bar',
        xKey: 'quarter',
        yKeys: ['revenue'],
        subplots: [[{ title: 'East', chartType: 'bar' }]],
      };

      expect(() => convertRechartsToMaidr(config)).toThrow('mutually exclusive');
    });

    it('throws when subplots is combined with top-level layers', () => {
      const config: RechartsAdapterConfig = {
        id: 'bad',
        data: eastData,
        xKey: 'quarter',
        layers: [{ yKey: 'revenue', chartType: 'bar' }],
        subplots: [[{ title: 'East', chartType: 'bar', yKeys: ['revenue'] }]],
      };

      expect(() => convertRechartsToMaidr(config)).toThrow('mutually exclusive');
    });

    it('throws when a panel defines neither chartType nor layers', () => {
      const config: RechartsAdapterConfig = {
        id: 'bad',
        data: eastData,
        xKey: 'quarter',
        yKeys: ['revenue'],
        subplots: [[{ title: 'East', chartType: 'bar' }], [{ title: 'Broken' }]],
      };

      expect(() => convertRechartsToMaidr(config)).toThrow('panel [1][0]');
    });

    it('throws when neither the panel nor the top level provides data', () => {
      const config: RechartsAdapterConfig = {
        id: 'bad',
        xKey: 'quarter',
        yKeys: ['revenue'],
        subplots: [[{ title: 'East', chartType: 'bar' }]],
      };

      expect(() => convertRechartsToMaidr(config)).toThrow('data is required');
    });
  });

  describe('getRechartsSelector with panelScope', () => {
    it('inserts the panel scope between the article scope and the leaf selector', () => {
      expect(getRechartsSelector('bar', undefined, 'facet', '.maidr-panel-1-2'))
        .toBe('#maidr-article-facet .maidr-panel-1-2 .recharts-bar-rectangle .recharts-rectangle');
    });

    it('uses the panel scope alone when no chartId is given', () => {
      expect(getRechartsSelector('scatter', undefined, undefined, '.maidr-panel-0-0'))
        .toBe('.maidr-panel-0-0 .recharts-scatter-symbol .recharts-symbols');
    });

    it('still returns undefined for multi-series charts', () => {
      expect(getRechartsSelector('bar', 1, 'facet', '.maidr-panel-0-0')).toBeUndefined();
    });

    it('keeps single-chart behavior unchanged when panelScope is omitted', () => {
      expect(getRechartsSelector('bar', undefined, 'facet'))
        .toBe('#maidr-article-facet .recharts-bar-rectangle .recharts-rectangle');
    });
  });

  describe('getPanelClassName', () => {
    it('generates the row/col wrapper class', () => {
      expect(getPanelClassName(0, 0)).toBe('maidr-panel-0-0');
      expect(getPanelClassName(2, 3)).toBe('maidr-panel-2-3');
    });
  });
});
