/**
 * A Google `BubbleChart` was refused outright — `createMaidrFromGoogleChart`
 * threw `Unsupported Google Charts type` — so a caller got an exception
 * rather than a chart (#1174).
 *
 * It is a scatter carrying more per point, not a different chart. Google
 * fixes `[ID, x, y]` and admits two optional columns after them, and the
 * ones MAIDR can read have homes already: the ID is
 * {@link ScatterPoint.label}, which `ScatterTrace` announces as the point's
 * name, and the size is {@link ScatterPoint.z}, which `zIntensityFor()`
 * sonifies. The series column is left out on purpose — `group` belongs to
 * `VolcanoPoint` and only `VolcanoTrace` reads it, so emitting one would put
 * a field in the payload no reader is told about.
 */
import type {
  GoogleBoundingBox,
  GoogleChart,
  GoogleChartType,
  GoogleDataTable,
} from '@adapters/google-charts/types';
import type { ScatterPoint } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The four-country table Google's own bubble example is drawn from. */
const FULL_ROWS: (string | number)[][] = [
  ['CAN', 80.66, 1.67, 'North America', 33739900],
  ['DEU', 79.84, 1.36, 'Europe', 81902307],
  ['DNK', 78.6, 1.84, 'Europe', 5523095],
  ['EGY', 72.73, 2.78, 'Middle East', 79716203],
];

function table(
  rows: (string | number)[][],
  labels: string[],
  types: string[],
): GoogleDataTable {
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r: number, c: number) => rows[r][c],
    getFormattedValue: (r: number, c: number) => String(rows[r][c] ?? ''),
    getColumnLabel: (c: number) => labels[c],
    getColumnType: (c: number) => types[c],
    getColumnRole: () => '',
  } as unknown as GoogleDataTable;
}

function fullTable(): GoogleDataTable {
  return table(
    FULL_ROWS,
    ['ID', 'Life Expectancy', 'Fertility', 'Region', 'Population'],
    ['string', 'number', 'number', 'string', 'number'],
  );
}

function pointBox(row: number): GoogleBoundingBox {
  return { left: 20 + row * 30, top: 40, width: 6, height: 6 };
}

function chartDrawing(rows: number): GoogleChart {
  return {
    getSelection: () => [],
    setSelection: () => {},
    getChartLayoutInterface: () => ({
      getBoundingBox: (id) => {
        const match = /^point#0#(\d+)$/.exec(id);
        if (!match || Number(match[1]) >= rows) {
          return null;
        }
        return pointBox(Number(match[1]));
      },
      getXLocation: value => Number(value),
      getYLocation: value => Number(value),
    }),
  };
}

function containerDrawing(rows: number): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('c') as HTMLElement;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);
  for (let r = 0; r < rows; r++) {
    const box = pointBox(r);
    const circle = doc.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', `${box.left + box.width / 2}`);
    circle.setAttribute('cy', `${box.top + box.height / 2}`);
    svg.appendChild(circle);
  }
  return container;
}

function build(dt: GoogleDataTable, rows = dt.getNumberOfRows()): {
  type: TraceType;
  data: ScatterPoint[];
  axes: Record<string, { label?: string }>;
  selectors: unknown;
} {
  const maidr = createMaidrFromGoogleChart(
    chartDrawing(rows),
    dt,
    containerDrawing(rows),
    { chartType: 'BubbleChart' as GoogleChartType, title: 'bubbles' },
  );
  const layer = maidr.subplots[0][0].layers[0];
  return {
    type: layer.type,
    data: layer.data as ScatterPoint[],
    axes: layer.axes as Record<string, { label?: string }>,
    selectors: layer.selectors,
  };
}

describe('google charts bubble chart', () => {
  it('is read rather than refused', () => {
    expect(() => build(fullTable())).not.toThrow();
  });

  it('is a scatter, which is what it is drawn from', () => {
    expect(build(fullTable()).type).toBe(TraceType.SCATTER);
  });

  it('takes its position from columns 1 and 2, not from the ID column', () => {
    const { data } = build(fullTable());
    expect(data.map(p => [p.x, p.y])).toEqual([
      [80.66, 1.67],
      [79.84, 1.36],
      [78.6, 1.84],
      [72.73, 2.78],
    ]);
  });

  it('names each point from the ID column', () => {
    expect(build(fullTable()).data.map(p => p.label))
      .toEqual(['CAN', 'DEU', 'DNK', 'EGY']);
  });

  it('carries the size as z, which is what makes it audible', () => {
    expect(build(fullTable()).data.map(p => p.z))
      .toEqual([33739900, 81902307, 5523095, 79716203]);
  });

  it('names the z axis after the column the magnitude came from', () => {
    const { axes } = build(fullTable());
    expect(axes.x.label).toBe('Life Expectancy');
    expect(axes.y.label).toBe('Fertility');
    expect(axes.z.label).toBe('Population');
  });

  it('does not put the series column in the payload', () => {
    // `group` is `VolcanoPoint`'s and only `VolcanoTrace` reads it. A field
    // no reader is told about is not coverage.
    for (const point of build(fullTable()).data) {
      expect(point).not.toHaveProperty('group');
    }
  });

  it('reads a three-column table as a plain named scatter', () => {
    const { data, axes } = build(table(
      [['CAN', 80.66, 1.67], ['DEU', 79.84, 1.36]],
      ['ID', 'Life Expectancy', 'Fertility'],
      ['string', 'number', 'number'],
    ));
    expect(data).toEqual([
      { x: 80.66, y: 1.67, label: 'CAN' },
      { x: 79.84, y: 1.36, label: 'DEU' },
    ]);
    expect(axes.z).toBeUndefined();
  });

  it('reads a numeric column 3 as the magnitude when there is no size column', () => {
    // Google lets column 3 be a number, which picks a colour off a gradient.
    // That is still a third quantity per point, and naming the axis after its
    // own column is what keeps saying so honest.
    const { data, axes } = build(table(
      [['CAN', 80.66, 1.67, 12.5], ['DEU', 79.84, 1.36, 3.25]],
      ['ID', 'Life Expectancy', 'Fertility', 'Temperature'],
      ['string', 'number', 'number', 'number'],
    ));
    expect(data.map(p => p.z)).toEqual([12.5, 3.25]);
    expect(axes.z.label).toBe('Temperature');
  });

  it('prefers the size over a numeric column 3 when a table carries both', () => {
    // There is one `z`, and the size is what the chart is named for and what
    // a sighted reader takes off the mark's area.
    const { data, axes } = build(table(
      [['CAN', 80.66, 1.67, 12.5, 33739900]],
      ['ID', 'Life Expectancy', 'Fertility', 'Temperature', 'Population'],
      ['string', 'number', 'number', 'number', 'number'],
    ));
    expect(data[0].z).toBe(33739900);
    expect(axes.z.label).toBe('Population');
  });

  it('ignores a string column 3 rather than reading it as a magnitude', () => {
    const { data, axes } = build(table(
      [['CAN', 80.66, 1.67, 'North America']],
      ['ID', 'Life Expectancy', 'Fertility', 'Region'],
      ['string', 'number', 'number', 'string'],
    ));
    expect(data[0].z).toBeUndefined();
    expect(axes.z).toBeUndefined();
  });

  it('leaves a point unnamed when the ID cell is empty', () => {
    const { data } = build(table(
      [['', 80.66, 1.67, 'NA', 1], ['DEU', 79.84, 1.36, 'EU', 2]],
      ['ID', 'Life Expectancy', 'Fertility', 'Region', 'Population'],
      ['string', 'number', 'number', 'string', 'number'],
    ));
    expect(data[0]).not.toHaveProperty('label');
    expect(data[1].label).toBe('DEU');
  });

  it('marks the circles it drew, one per bubble', () => {
    // A `BubbleChart` is a corechart class, so unlike Sankey and TreeMap it
    // does expose `getChartLayoutInterface()` and the circles can be matched
    // by their bounding box rather than only by DOM order.
    const { selectors } = build(fullTable());
    expect(selectors).toBeDefined();
  });
});
