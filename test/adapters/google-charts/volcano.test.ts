import type {
  GoogleBoundingBox,
  GoogleChart,
  GoogleChartType,
  GoogleDataTable,
} from '@adapters/google-charts/types';
import type { VolcanoPoint } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One row of a volcano table: fold change, significance, gene name. */
type VolcanoRow = [number, number, string];

const VOLCANO_ROWS: VolcanoRow[] = [
  [-2.4, 7.1, 'BRCA1'],
  [0.3, 0.4, 'ACTB'],
  [3.1, 9.8, 'TP53'],
];

/**
 * A Manhattan table drawn with the banding recipe: one column per chromosome,
 * null outside its own region, with the SNP name attached to the domain.
 */
type ManhattanRow = [number, number | null, number | null, string];

const MANHATTAN_ROWS: ManhattanRow[] = [
  [1, 4.2, null, 'rs100'],
  [2, 8.6, null, 'rs101'],
  [3, null, 2.1, 'rs200'],
  [4, null, 7.7, 'rs201'],
];

/** Minimal DataTable fake whose labels, types and roles are supplied. */
function makeScatterDataTable(
  rows: (number | string | null)[][],
  labels: string[],
  roles: (string | undefined)[],
): GoogleDataTable {
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) => String(rows[r][c] ?? ''),
    getColumnLabel: c => labels[c],
    getColumnType: c => (typeof rows[0][c] === 'string' ? 'string' : 'number'),
    getColumnRole: c => roles[c] ?? '',
  };
}

function volcanoTable(): GoogleDataTable {
  return makeScatterDataTable(
    VOLCANO_ROWS,
    ['log2 fold change', '-log10(p)', ''],
    [undefined, undefined, 'annotation'],
  );
}

function manhattanTable(): GoogleDataTable {
  return makeScatterDataTable(
    MANHATTAN_ROWS,
    ['Position', 'chr1', 'chr2', ''],
    [undefined, undefined, undefined, 'annotation'],
  );
}

/** Locations the fake layout reports for each drawn point marker. */
function pointBox(series: number, row: number): GoogleBoundingBox {
  return { left: 20 + row * 30, top: 40 + series * 100, width: 6, height: 6 };
}

/**
 * A chart whose layout interface places a marker for exactly the
 * `series#row` pairs it was told the chart drew.
 */
function makeScatterChart(drawn: readonly [number, number][]): GoogleChart {
  const known = new Set(drawn.map(([series, row]) => `${series}#${row}`));
  return {
    getSelection: () => [],
    setSelection: () => {},
    getChartLayoutInterface: () => ({
      getBoundingBox: (id) => {
        const match = /^point#(\d+)#(\d+)$/.exec(id);
        if (!match || !known.has(`${match[1]}#${match[2]}`)) {
          return null;
        }
        return pointBox(Number(match[1]), Number(match[2]));
      },
      getXLocation: value => Number(value),
      getYLocation: value => Number(value),
    }),
  };
}

/** Builds a rendered scatter with one circle per drawn marker, in the given order. */
function makeScatterContainer(drawn: readonly [number, number][]): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="hit-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('hit-chart') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);

  for (const [series, row] of drawn) {
    const box = pointBox(series, row);
    const circle = doc.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', `${box.left + box.width / 2}`);
    circle.setAttribute('cy', `${box.top + box.height / 2}`);
    svg.appendChild(circle);
  }

  return container;
}

/** The markers a single-series volcano draws, in data order. */
const VOLCANO_MARKERS: [number, number][] = [[0, 0], [0, 1], [0, 2]];

/** The markers the banded Manhattan draws: chromosome 1, then chromosome 2. */
const MANHATTAN_MARKERS: [number, number][] = [[0, 0], [0, 1], [1, 2], [1, 3]];

function build(
  chartType: GoogleChartType,
  dt: GoogleDataTable,
  drawn: readonly [number, number][],
  container = makeScatterContainer(drawn),
  options: { thresholdOptions?: { significance?: number; effect?: number } } = {},
): {
  layer: ReturnType<typeof createMaidrFromGoogleChart>['subplots'][0][0]['layers'][0];
  container: HTMLElement;
} {
  const maidr = createMaidrFromGoogleChart(makeScatterChart(drawn), dt, container, {
    chartType,
    ...options,
  });
  return { layer: maidr.subplots[0][0].layers[0], container };
}

// The order-mismatch case warns on purpose.
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

describe('createMaidrFromGoogleChart with a VolcanoChart', () => {
  it('reads the coordinates and the identity the annotation column carries', () => {
    const { layer } = build('VolcanoChart', volcanoTable(), VOLCANO_MARKERS);

    expect(layer.type).toBe(TraceType.VOLCANO);
    // Identity is the payload: a reader told "x is 3.1, y is 9.8" has the two
    // numbers the axes already describe and not the gene they came for.
    expect(layer.data as VolcanoPoint[]).toEqual([
      { x: -2.4, y: 7.1, label: 'BRCA1' },
      { x: 0.3, y: 0.4, label: 'ACTB' },
      { x: 3.1, y: 9.8, label: 'TP53' },
    ]);
  });

  it('gives a single-series chart no region', () => {
    const { layer } = build('VolcanoChart', volcanoTable(), VOLCANO_MARKERS);

    // With one column its label names the y axis, not a region: announcing
    // "Region: -log10(p)" on every point would invent a split.
    expect((layer.data as VolcanoPoint[]).every(point => point.group === undefined)).toBe(true);
    expect(layer.axes).toEqual({
      x: { label: 'log2 fold change' },
      y: { label: '-log10(p)' },
    });
  });

  it('carries the thresholds the caller declared and nothing when they do not', () => {
    const declared = build('VolcanoChart', volcanoTable(), VOLCANO_MARKERS, undefined, {
      thresholdOptions: { significance: 1.3, effect: 1 },
    });
    expect(declared.layer.thresholdOptions).toEqual({ significance: 1.3, effect: 1 });

    // MAIDR guesses no cutoff: a line at the wrong place would sort every
    // point on the figure onto the wrong side of it.
    expect(build('VolcanoChart', volcanoTable(), VOLCANO_MARKERS).layer.thresholdOptions)
      .toBeUndefined();
  });

  it('marks one drawn marker per point for highlighting', () => {
    const { layer, container } = build('VolcanoChart', volcanoTable(), VOLCANO_MARKERS);

    const marked = Array.from(
      container.ownerDocument.querySelectorAll(String(layer.selectors)),
    );
    expect(marked.map(circle => circle.getAttribute('data-maidr-hit')))
      .toEqual(['0', '1', '2']);
  });
});

describe('createMaidrFromGoogleChart with a ManhattanChart', () => {
  it('flattens every chromosome column, dropping the cells it left null', () => {
    const { layer } = build('ManhattanChart', manhattanTable(), MANHATTAN_MARKERS);

    expect(layer.type).toBe(TraceType.MANHATTAN);
    // A builder that stopped at column 1 would read one chromosome and call
    // it the genome; the nulls are how the recipe leaves a row out of a
    // series, not a missing measurement.
    expect(layer.data as VolcanoPoint[]).toEqual([
      { x: 1, y: 4.2, label: 'rs100', group: 'chr1' },
      { x: 2, y: 8.6, label: 'rs101', group: 'chr1' },
      { x: 3, y: 2.1, label: 'rs200', group: 'chr2' },
      { x: 4, y: 7.7, label: 'rs201', group: 'chr2' },
    ]);
  });

  it('leaves the significance axis unnamed when the columns are regions', () => {
    const { layer } = build('ManhattanChart', manhattanTable(), MANHATTAN_MARKERS);

    expect(layer.axes?.x).toEqual({ label: 'Position' });
    expect(layer.axes?.y).toEqual({ label: undefined });
  });

  it('marks the markers of every series in the order the points were flattened', () => {
    const { layer, container } = build('ManhattanChart', manhattanTable(), MANHATTAN_MARKERS);

    const marked = Array.from(
      container.ownerDocument.querySelectorAll(String(layer.selectors)),
    );
    // `ScatterTrace` pairs the resolved elements with the points by index, so
    // a dropped null cell has to drop its marker too.
    expect(marked).toHaveLength(4);
    expect(marked.map(circle => circle.getAttribute('data-maidr-hit')))
      .toEqual(['0', '1', '2', '3']);
  });

  it('withdraws the marks when the chart drew its series out of data order', () => {
    const container = makeScatterContainer([...MANHATTAN_MARKERS].reverse());
    const { layer } = build('ManhattanChart', manhattanTable(), MANHATTAN_MARKERS, container);

    expect(layer.selectors).toBeUndefined();
    expect(container.querySelectorAll('[data-maidr-hit]')).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Manhattan point order mismatch'),
    );
  });
});
