import type {
  GoogleBoundingBox,
  GoogleChart,
  GoogleChartType,
  GoogleDataTable,
} from '@adapters/google-charts/types';
import type { MaidrLayer } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { describe, expect, it } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One row: the category, then every numeric column in table order. */
type MarkRow = [string, ...number[]];

const STAGES: MarkRow[] = [
  ['Visited', 10000],
  ['Signed up', 2400],
  ['Purchased', 100],
];

/** Minimal DataTable fake for a category-and-magnitude table. */
function makeDataTable(rows: MarkRow[], labels: string[]): GoogleDataTable {
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) => String(rows[r][c]),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 0 ? 'string' : 'number'),
  };
}

/** Where the fake layout puts bar `index` of series 0. */
function barBox(index: number): GoogleBoundingBox {
  return { left: 20 + index * 40, top: 30, width: 24, height: 100 };
}

/** Where the fake layout puts point marker `index` of series 0. */
function pointBox(index: number): GoogleBoundingBox {
  return { left: 20 + index * 40, top: 50, width: 8, height: 8 };
}

/** A chart whose layout interface places both a bar and a point per row. */
function makeChart(rowCount = STAGES.length): GoogleChart {
  return {
    getSelection: () => [],
    setSelection: () => {},
    getChartLayoutInterface: () => ({
      getBoundingBox: (id) => {
        const bar = /^bar#0#(\d+)$/.exec(id);
        if (bar) {
          const index = Number(bar[1]);
          return index < rowCount ? barBox(index) : null;
        }
        const point = /^point#0#(\d+)$/.exec(id);
        if (point) {
          const index = Number(point[1]);
          return index < rowCount ? pointBox(index) : null;
        }
        return null;
      },
      getXLocation: value => Number(value),
      getYLocation: value => Number(value),
    }),
  };
}

/** Builds a rendered chart carrying one rect and one circle per row. */
function makeContainer(rowCount = STAGES.length): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="mark-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('mark-chart') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);

  for (let i = 0; i < rowCount; i++) {
    const bar = barBox(i);
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', `${bar.left}`);
    rect.setAttribute('y', `${bar.top}`);
    rect.setAttribute('width', `${bar.width}`);
    rect.setAttribute('height', `${bar.height}`);
    svg.appendChild(rect);

    const point = pointBox(i);
    const circle = doc.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', `${point.left + point.width / 2}`);
    circle.setAttribute('cy', `${point.top + point.height / 2}`);
    svg.appendChild(circle);
  }

  return container;
}

function build(
  chartType: GoogleChartType,
  dt: GoogleDataTable,
  container: HTMLElement = makeContainer(),
): { layer: MaidrLayer; container: HTMLElement } {
  const maidr = createMaidrFromGoogleChart(makeChart(), dt, container, { chartType });
  return { layer: maidr.subplots[0][0].layers[0], container };
}

describe('createMaidrFromGoogleChart with a DotChart', () => {
  it('reads a dot plot as a bar chart that announces itself as a dot plot', () => {
    const dt = makeDataTable(STAGES, ['Stage', 'People']);

    const { layer } = build('DotChart', dt);

    // Same payload a bar layer carries: the two marks differ in what is drawn,
    // not in what a reader navigates.
    expect(layer.type).toBe(TraceType.DOT);
    expect(layer.data).toEqual([
      { x: 'Visited', y: 10000 },
      { x: 'Signed up', y: 2400 },
      { x: 'Purchased', y: 100 },
    ]);
    expect(layer.axes).toEqual({ x: { label: 'Stage' }, y: { label: 'People' } });
  });

  it('highlights the point markers rather than a bar that was never drawn', () => {
    const dt = makeDataTable(STAGES, ['Stage', 'People']);

    const { layer, container } = build('DotChart', dt);

    const marked = Array.from(
      container.ownerDocument.querySelectorAll(String(layer.selectors)),
    );
    expect(marked).toHaveLength(STAGES.length);
    expect(marked.every(element => element.tagName === 'circle')).toBe(true);
    expect(marked.map(element => element.getAttribute('data-maidr-dot')))
      .toEqual(['0', '1', '2']);
  });
});

describe('createMaidrFromGoogleChart with a LollipopChart', () => {
  // The ComboChart recipe repeats the value so the stems and the dots can be
  // styled apart. Read generically that second column is another series, and
  // the chart would be announced as a dodged bar of two identical sets.
  const DUPLICATED = makeDataTable(
    STAGES.map(([stage, value]) => [stage, value, value] as MarkRow),
    ['Stage', 'People', 'People'],
  );

  it('reads the duplicated value column as one series, not as two', () => {
    const { layer } = build('LollipopChart', DUPLICATED);

    expect(layer.type).toBe(TraceType.LOLLIPOP);
    expect(layer.data).toEqual([
      { x: 'Visited', y: 10000 },
      { x: 'Signed up', y: 2400 },
      { x: 'Purchased', y: 100 },
    ]);
  });

  it('highlights the stem drawn for each category', () => {
    const { layer, container } = build('LollipopChart', DUPLICATED);

    const marked = Array.from(
      container.ownerDocument.querySelectorAll(String(layer.selectors)),
    );
    expect(marked).toHaveLength(STAGES.length);
    expect(marked.every(element => element.tagName === 'rect')).toBe(true);
  });
});

describe('createMaidrFromGoogleChart with a FunnelChart', () => {
  it('reads the stage counts and leaves the retention to the model', () => {
    const dt = makeDataTable(STAGES, ['Stage', 'People']);

    const { layer } = build('FunnelChart', dt);

    expect(layer.type).toBe(TraceType.FUNNEL);
    // A funnel runs its stages down the page and its counts along it.
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.data).toEqual([
      { x: 'Visited', y: 10000 },
      { x: 'Signed up', y: 2400 },
      { x: 'Purchased', y: 100 },
    ]);
  });

  it('skips the transparent padding series of the centred recipe', () => {
    // The trapezoid look is drawn by stacking a spacer of (widest - count) / 2
    // under each bar. It grows exactly as the counts fall, so read as the
    // stages it would announce a funnel that widens.
    const padded = makeDataTable(
      STAGES.map(([stage, count]) => [stage, (10000 - count) / 2, count] as MarkRow),
      ['Stage', 'Padding', 'People'],
    );

    const { layer } = build('FunnelChart', padded);

    expect(layer.data).toEqual([
      { x: 'Visited', y: 10000 },
      { x: 'Signed up', y: 2400 },
      { x: 'Purchased', y: 100 },
    ]);
    expect(layer.axes?.y).toEqual({ label: 'People' });
  });
});
