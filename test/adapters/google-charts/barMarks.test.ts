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

/**
 * Where the padded funnel recipe puts bar `index` of `series`.
 *
 * Series 0 is the transparent spacer that centres the stage, so it sits at the
 * start of the stack and the visible stage bar follows it.
 */
function stackedBarBox(series: number, index: number): GoogleBoundingBox {
  return series === 0
    ? { left: 10, top: 30 + index * 40, width: 30, height: 24 }
    : { left: 40, top: 30 + index * 40, width: 120, height: 24 };
}

/** A chart drawn with the padding series stacked under the counts. */
function makeStackedChart(rowCount = STAGES.length): GoogleChart {
  return {
    getSelection: () => [],
    setSelection: () => {},
    getChartLayoutInterface: () => ({
      getBoundingBox: (id) => {
        const bar = /^bar#(\d+)#(\d+)$/.exec(id);
        if (!bar) {
          return null;
        }
        const index = Number(bar[2]);
        return index < rowCount ? stackedBarBox(Number(bar[1]), index) : null;
      },
      getXLocation: value => Number(value),
      getYLocation: value => Number(value),
    }),
  };
}

/** The rects that recipe draws: a padding rect and a stage rect per row. */
function makeStackedContainer(rowCount = STAGES.length): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="funnel-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('funnel-chart') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);

  const add = (id: string, box: GoogleBoundingBox): void => {
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('id', id);
    rect.setAttribute('x', `${box.left}`);
    rect.setAttribute('y', `${box.top}`);
    rect.setAttribute('width', `${box.width}`);
    rect.setAttribute('height', `${box.height}`);
    svg.appendChild(rect);
  };

  for (let i = 0; i < rowCount; i++) {
    add(`pad-${i}`, stackedBarBox(0, i));
    add(`count-${i}`, stackedBarBox(1, i));
  }

  return container;
}

/**
 * How many times the run reads a rect's left edge from the DOM.
 *
 * Matching a bar to its rect is a DOM read per candidate, so the count says
 * whether the search makes one pass over the rects or one pass per bar.
 *
 * @param container - The container whose document to instrument
 * @param run       - The conversion to measure
 * @returns How many `x` reads it made
 */
function countLeftEdgeReads(container: HTMLElement, run: () => void): number {
  const view = container.ownerDocument.defaultView;
  if (!view) {
    throw new Error('the fixture has no window');
  }

  const proto = view.Element.prototype;
  const original = proto.getAttribute;
  let reads = 0;
  proto.getAttribute = function (name: string): string | null {
    if (name === 'x') {
      reads += 1;
    }
    return original.call(this, name);
  };

  try {
    run();
  } finally {
    proto.getAttribute = original;
  }

  return reads;
}

describe('a segmented chart of many bars', () => {
  it('finds each rect without rescanning the whole SVG for every one', () => {
    // `series x categories x rects` with four attribute reads in the inner
    // loop, and a segmented chart draws about as many rects as it has bars --
    // so the cost is quadratic in chart size, all of it synchronous inside
    // the caller's `ready` handler.
    const categories = 60;
    const series = 4;
    const box = (s: number, c: number): GoogleBoundingBox =>
      ({ left: 20 + c * 20, top: 30 + s * 120, width: 10, height: 100 });

    const rows: MarkRow[] = Array.from(
      { length: categories },
      (_, c) => [`c${c}`, ...Array.from({ length: series }, (_, s) => c + s)] as MarkRow,
    );
    const dt = makeDataTable(
      rows,
      ['Category', ...Array.from({ length: series }, (_, s) => `S${s}`)],
    );

    const chart: GoogleChart = {
      getSelection: () => [],
      setSelection: () => {},
      getChartLayoutInterface: () => ({
        getBoundingBox: (id) => {
          const bar = /^bar#(\d+)#(\d+)$/.exec(id);
          if (!bar || Number(bar[1]) >= series || Number(bar[2]) >= categories) {
            return null;
          }
          return box(Number(bar[1]), Number(bar[2]));
        },
        getXLocation: value => 20 + Number(value) * 20,
        getYLocation: value => 30 + Number(value) * 20,
      }),
    };

    const dom = new JSDOM('<!doctype html><body><div id="many-bars"></div></body>');
    const doc = dom.window.document;
    const container = doc.getElementById('many-bars') as HTMLElement;
    const svg = doc.createElementNS(SVG_NS, 'svg');
    container.appendChild(svg);
    for (let s = 0; s < series; s++) {
      for (let c = 0; c < categories; c++) {
        const rect = doc.createElementNS(SVG_NS, 'rect');
        const at = box(s, c);
        rect.setAttribute('x', `${at.left}`);
        rect.setAttribute('y', `${at.top}`);
        rect.setAttribute('width', `${at.width}`);
        rect.setAttribute('height', `${at.height}`);
        svg.appendChild(rect);
      }
    }

    const reads = countLeftEdgeReads(container, () => {
      createMaidrFromGoogleChart(chart, dt, container, { chartType: 'StackedColumnChart' });
    });

    // Every bar still found.
    expect(container.querySelectorAll('[data-maidr-bar]'))
      .toHaveLength(series * categories);
    // A handful of reads per rect, not a scan per bar.
    expect(reads).toBeLessThanOrEqual(series * categories * 4);
  });
});

describe('a chart drawn by a package with no layout interface', () => {
  /**
   * The material packages (`google.charts.Bar`, `google.charts.Line`) expose
   * no `getChartLayoutInterface`, so calling it throws a TypeError. Every
   * marking helper called it unguarded, and the throw travelled out of
   * `createMaidrFromGoogleChart` inside the caller's own `ready` handler --
   * so the `maidr` attribute was never set and the chart was not merely
   * unhighlighted but entirely inaccessible.
   */
  const NO_LAYOUT: GoogleChart = {
    getSelection: () => [],
    setSelection: () => {},
    getChartLayoutInterface: () => {
      throw new TypeError('chart.getChartLayoutInterface is not a function');
    },
  };

  it.each([
    ['BarChart', 1],
    ['StackedColumnChart', 2],
    ['ScatterChart', 1],
    ['VolcanoChart', 1],
  ] as [GoogleChartType, number][])('still reads a %s', (chartType, series) => {
    const dt = series === 1
      ? makeDataTable(STAGES, ['Stage', 'People'])
      : makeDataTable(
          STAGES.map(([stage, value]) => [stage, value, value] as MarkRow),
          ['Stage', 'People', 'Others'],
        );

    const maidr = createMaidrFromGoogleChart(NO_LAYOUT, dt, makeContainer(), { chartType });

    // The reading survives; only the outline may be missing.
    expect(maidr.subplots[0][0].layers[0].data).toBeDefined();
  });
});

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
    // A funnel runs its stages down the page and its counts along it, so the
    // count is in `x` and the stage in `y` -- the arrangement `FunnelTrace`
    // reads a `horz` layer in (#955). This case asserted the other way round
    // until then, which is why the bug survived: every stage was silent.
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.data).toEqual([
      { x: 10000, y: 'Visited' },
      { x: 2400, y: 'Signed up' },
      { x: 100, y: 'Purchased' },
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
      { x: 10000, y: 'Visited' },
      { x: 2400, y: 'Signed up' },
      { x: 100, y: 'Purchased' },
    ]);
    // The counts' own label travels to `x` with them.
    expect(layer.axes?.x).toEqual({ label: 'People' });
  });

  it('outlines the stage bars, not the padding stacked under them', () => {
    // The payload is read off the counts column, so the highlight has to be
    // asked for the same series. Asked for series 0, it outlines a
    // transparent rect that starts where the stack does and is as wide as the
    // spacer -- a sighted collaborator sees the outline on the wrong
    // geometry while the audio and the text are right.
    const padded = makeDataTable(
      STAGES.map(([stage, count]) => [stage, (10000 - count) / 2, count] as MarkRow),
      ['Stage', 'Padding', 'People'],
    );
    const container = makeStackedContainer();

    const layer = createMaidrFromGoogleChart(
      makeStackedChart(),
      padded,
      container,
      { chartType: 'FunnelChart' },
    ).subplots[0][0].layers[0];

    const marked = Array.from(
      container.ownerDocument.querySelectorAll(String(layer.selectors)),
    );
    expect(marked.map(element => element.id)).toEqual(['count-0', 'count-1', 'count-2']);
  });
});
