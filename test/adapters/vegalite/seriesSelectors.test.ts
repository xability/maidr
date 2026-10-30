/**
 * @jest-environment jsdom
 */

/**
 * Each series of a colour-split Vega-Lite line is highlighted as its own line.
 *
 * Vega draws the series as paths under one set of classes, so the converter
 * repeats one selector per series and `LineTrace` takes the r-th match for
 * series r. `LineTrace` first tries a selector as one element per point,
 * though, and takes it whenever the selector matches as many elements as the
 * series has points -- so on a chart with as many series as points per
 * series (the gallery's bump chart: three teams over three rounds; its
 * parallel coordinates: three cars over three axes) every point of every
 * series was highlighted as a whole line chosen by the column, and Up/Down
 * never moved it.
 *
 * The marks below imitate what Vega renders for a colour-split line: one
 * `<g class="mark-line role-mark layer_0_marks">` per series, each holding the
 * series' path.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { Maidr, MaidrLayer } from '@type/grammar';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LineTrace } from '@model/line';
import { initMaidrOnElement } from '@util/initMaidr';
import { bindVegaLite } from '../../../src/vegalite-entry';

jest.mock('@util/initMaidr', () => ({ initMaidrOnElement: jest.fn() }));
const initMock = initMaidrOnElement as unknown as jest.Mock;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Row = Record<string, string | number>;

/** Three teams over three rounds. */
const ROWS: Row[] = ['Ajax', 'Brugge', 'Celtic'].flatMap((team, t) =>
  ['R1', 'R2', 'R3'].map((round, i) => ({ team, round, rank: ((t + i) % 3) + 1 })),
);

/**
 * jsdom implements none of the per-tag SVG interfaces, so `LineTrace`'s
 * `instanceof SVGPathElement` test would throw. Answer it by tag, as a
 * browser would.
 */
function defineSvgPathElement(): void {
  if ('SVGPathElement' in globalThis)
    return;
  Object.defineProperty(globalThis, 'SVGPathElement', {
    configurable: true,
    writable: true,
    value: class SVGPathElementShim {
      public static [Symbol.hasInstance](value: unknown): boolean {
        return value instanceof SVGElement && value.tagName === 'path';
      }
    },
  });
}

/**
 * The line spec over the given rows.
 * @param rows - The rows
 * @returns The spec
 */
function specFor(rows: Row[]): VegaLiteSpec {
  return {
    data: { values: rows },
    mark: 'line',
    encoding: {
      x: { field: 'round', type: 'ordinal' },
      y: { field: 'rank', type: 'quantitative' },
      color: { field: 'team', type: 'nominal' },
    },
  } as unknown as VegaLiteSpec;
}

/**
 * A rendered colour-split line: one mark group per series, in the series'
 * order, each path running through its series' points.
 * @param rows  - The rows
 * @param drawn - How many of the series Vega drew, from the first
 * @returns The view to bind
 */
function chart(rows: Row[], drawn = Number.POSITIVE_INFINITY): VegaView {
  const container = document.createElement('div');
  container.id = 'chart';
  const svg = document.createElementNS(SVG_NS, 'svg');
  const scope = document.createElementNS(SVG_NS, 'g');
  scope.setAttribute('class', 'mark-group role-scope layer_0_pathgroup');

  const teams = [...new Set(rows.map(row => String(row.team)))].slice(0, drawn);
  for (const team of teams) {
    const item = document.createElementNS(SVG_NS, 'g');
    const marks = document.createElementNS(SVG_NS, 'g');
    marks.setAttribute('class', 'mark-line role-mark layer_0_marks');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('id', `line-${team}`);
    const vertices = rows
      .filter(row => row.team === team)
      .map((row, i) => `${100 + i * 100},${Number(row.rank) * 50}`);
    path.setAttribute('d', `M${vertices.join('L')}`);
    marks.appendChild(path);
    item.appendChild(marks);
    scope.appendChild(item);
  }
  svg.appendChild(scope);
  container.appendChild(svg);
  document.body.appendChild(container);

  const view = {
    container: () => container,
    data: (name: string) => {
      throw new Error(`no dataset ${name}`);
    },
    runAsync: async (): Promise<unknown> => view,
    scale: () => {
      throw new Error('no scales');
    },
  } as unknown as VegaView;
  return view;
}

/**
 * Bind a chart and return the line layer MAIDR is handed.
 * @param rows  - The rows
 * @param drawn - How many series are drawn
 * @returns The layer
 */
function bound(rows: Row[], drawn?: number): MaidrLayer {
  bindVegaLite(chart(rows, drawn), specFor(rows));
  const maidr = initMock.mock.calls[0]?.[0] as Maidr | undefined;
  const layer = maidr?.subplots?.[0]?.[0]?.layers?.[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer;
}

/**
 * The ids of the elements each of a layer's selectors resolves to.
 * @param layer - The layer
 * @returns One list of ids per selector
 */
function resolved(layer: MaidrLayer): string[][] {
  return (layer.selectors as string[]).map(selector =>
    Array.from(document.querySelectorAll(selector)).map(element => element.id));
}

describe('a vega-lite line with as many series as points per series', () => {
  beforeEach(() => {
    initMock.mockClear();
    document.body.innerHTML = '';
    defineSvgPathElement();
  });

  it('gives each series a selector that resolves to its own path', () => {
    const layer = bound(ROWS);

    // Before the fix: three copies of one selector, each resolving to all
    // three paths.
    expect(resolved(layer)).toEqual([['line-Ajax'], ['line-Brugge'], ['line-Celtic']]);
  });

  it('is highlighted a series at a time, at each point along it', () => {
    const trace = new LineTrace(bound(ROWS));

    // Before the fix, every point was one of the three paths, picked by the
    // column, and the paths were not the series' geometry.
    expect(trace.getGeometryElements().map(element => element.id))
      .toEqual(['line-Ajax', 'line-Brugge', 'line-Celtic']);
    trace.dispose();
  });
});

describe('a vega-lite line the series selectors are left alone on', () => {
  beforeEach(() => {
    initMock.mockClear();
    document.body.innerHTML = '';
  });

  it('keeps the shared selector when a series has a single point', () => {
    // `LineTrace` takes a lone point's selector as that point's element, and
    // a one-element selector would hand it the whole path.
    const rows: Row[] = [...ROWS, { team: 'Dundee', round: 'R1', rank: 4 }];

    const layer = bound(rows);

    const selectors = layer.selectors as string[];
    expect(new Set(selectors).size).toBe(1);
  });

  it('keeps the shared selector when the chart draws fewer paths than series', () => {
    const layer = bound(ROWS, 2);

    const selectors = layer.selectors as string[];
    expect(new Set(selectors).size).toBe(1);
  });
});
