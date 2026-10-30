/**
 * @jest-environment jsdom
 */

/**
 * A stacked area's bands are listed from the bottom of the stack up, as the
 * chart draws them.
 *
 * MAIDR reads a stacked area's bands as listed from the bottom of the stack
 * up, and the converter listed them in the order their rows first appear.
 * Vega-Lite stacks a vertical stack's bands in descending order of the field
 * that splits them, so rows listing Zeta, Alpha, Mid at every x are drawn
 * with Zeta at the bottom, Mid on it and Alpha on top -- and were read Zeta,
 * Alpha, Mid.
 *
 * Measured on vega 5.33 + vega-lite 5.23 in Chromium with `renderer: 'svg'`:
 * the three paths come in the rows' order, and their boxes are the ones the
 * paths below are given. jsdom lays nothing out, so each path's box is
 * stubbed.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { LinePoint, Maidr, MaidrLayer } from '@type/grammar';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { initMaidrOnElement } from '@util/initMaidr';
import { bindVegaLite } from '../../../src/vegalite-entry';

jest.mock('@util/initMaidr', () => ({ initMaidrOnElement: jest.fn() }));
const initMock = initMaidrOnElement as unknown as jest.Mock;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The bands in the order the rows list them, at every x. */
const LISTED = ['Zeta', 'Alpha', 'Mid'];

const ROWS = [1, 2, 3, 4].flatMap(x => [
  { x, series: 'Zeta', v: 30 + x },
  { x, series: 'Alpha', v: 5 + x },
  { x, series: 'Mid', v: 15 + x },
]);

/** Where a path is drawn on the page. */
interface Box { left: number; top: number; right: number; bottom: number }

/** The measured boxes of a zero-based stack, in the rows' order. */
const STACKED: Box[] = [
  { left: 60, top: 172, right: 460, bottom: 329 },
  { left: 60, top: 43, right: 460, bottom: 112 },
  { left: 60, top: 84, right: 460, bottom: 186 },
];

/** The measured boxes of a normalized stack, in the rows' order. */
const NORMALIZED: Box[] = [
  { left: 60, top: 159, right: 460, bottom: 334 },
  { left: 60, top: 34, right: 460, bottom: 78 },
  { left: 60, top: 68, right: 460, bottom: 169 },
];

/**
 * A stacked area over the rows.
 * @param stack - How the bands are stacked
 * @param horizontal - Whether the stack runs along x
 * @returns The spec
 */
function stackedArea(stack: 'zero' | 'normalize', horizontal = false): VegaLiteSpec {
  const position = { field: 'x', type: 'quantitative' };
  const value = { field: 'v', type: 'quantitative', stack };
  return {
    data: { values: ROWS },
    mark: 'area',
    encoding: {
      x: horizontal ? value : position,
      y: horizontal ? position : value,
      color: { field: 'series', type: 'nominal' },
    },
  } as unknown as VegaLiteSpec;
}

/**
 * A rendered chart: one area path per band, in the order the rows list the
 * bands, each named by its band and drawn in the given box.
 * @param boxes - Each path's box, in the rows' order
 * @returns The view reporting the container
 */
function chart(boxes: Box[]): VegaView {
  const container = document.createElement('div');
  container.id = 'chart';
  const svg = document.createElementNS(SVG_NS, 'svg');
  boxes.forEach((box, band) => {
    const marks = document.createElementNS(SVG_NS, 'g');
    marks.setAttribute('class', 'mark-area role-mark marks');
    const path = document.createElementNS(SVG_NS, 'path');
    path.id = LISTED[band];
    path.getBoundingClientRect = (): DOMRect => ({
      x: box.left,
      y: box.top,
      width: box.right - box.left,
      height: box.bottom - box.top,
      ...box,
    }) as DOMRect;
    marks.appendChild(path);
    svg.appendChild(marks);
  });
  container.appendChild(svg);
  document.body.appendChild(container);

  return {
    container: () => container,
    data: (name: string) => {
      throw new Error(`no dataset ${name}`);
    },
    runAsync: async (): Promise<unknown> => undefined,
    scale: () => undefined,
  } as unknown as VegaView;
}

/**
 * Bind a spec against the drawn bands and hand back the layer.
 * @param spec - The spec to bind
 * @param boxes - Each path's box, in the rows' order
 * @returns The emitted layer
 */
function boundLayer(spec: VegaLiteSpec, boxes: Box[]): MaidrLayer {
  initMock.mockClear();
  bindVegaLite(chart(boxes), spec);
  const maidr = initMock.mock.calls[0]?.[0] as Maidr | undefined;
  const layer = maidr?.subplots?.[0]?.[0]?.layers?.[0];
  if (!layer) {
    throw new Error('no layer emitted');
  }
  return layer;
}

/**
 * The band each series of a layer is.
 * @param layer - The layer
 * @returns Each series' name, in the order they are listed
 */
function bands(layer: MaidrLayer): Array<string | undefined> {
  return (layer.data as LinePoint[][]).map(points => points[0]?.z);
}

/**
 * The path each series of a layer is highlighted on.
 * @param layer - The layer
 * @returns The id of each series' one match, or of every match
 */
function paths(layer: MaidrLayer): string[][] {
  return (layer.selectors as string[]).map(selector =>
    Array.from(document.querySelectorAll(selector)).map(el => el.id));
}

describe('a vega-lite stacked area', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('lists the bands from the bottom of the stack up', () => {
    const layer = boundLayer(stackedArea('zero'), STACKED);

    // Before the fix: the rows' order, Zeta, Alpha, Mid.
    expect(layer.type).toBe('stacked_area');
    expect(bands(layer)).toEqual(['Zeta', 'Mid', 'Alpha']);
  });

  it('keeps each band on the path it is drawn as', () => {
    const layer = boundLayer(stackedArea('zero'), STACKED);

    expect(paths(layer)).toEqual([['Zeta'], ['Mid'], ['Alpha']]);
    expect((layer.data as LinePoint[][])[1].map(point => point.y)).toEqual([16, 17, 18, 19]);
  });

  it('lists a normalized stack\'s bands the same way', () => {
    const layer = boundLayer(stackedArea('normalize'), NORMALIZED);

    expect(layer.type).toBe('stacked_normalized_area');
    expect(bands(layer)).toEqual(['Zeta', 'Mid', 'Alpha']);
    expect(paths(layer)).toEqual([['Zeta'], ['Mid'], ['Alpha']]);
  });

  it('lists a horizontal stack\'s bands from the left', () => {
    const across: Box[] = [
      { left: 300, top: 20, right: 460, bottom: 320 },
      { left: 60, top: 20, right: 110, bottom: 320 },
      { left: 110, top: 20, right: 300, bottom: 320 },
    ];

    const layer = boundLayer(stackedArea('zero', true), across);

    expect(bands(layer)).toEqual(['Alpha', 'Mid', 'Zeta']);
    expect(paths(layer)).toEqual([['Alpha'], ['Mid'], ['Zeta']]);
  });

  it('leaves bands drawn in the rows\' order as they are', () => {
    // Zeta at the bottom, Alpha on it and Mid on top: the order the rows
    // already list them in.
    const inOrder: Box[] = [
      { left: 60, top: 220, right: 460, bottom: 329 },
      { left: 60, top: 150, right: 460, bottom: 230 },
      { left: 60, top: 43, right: 460, bottom: 160 },
    ];

    const layer = boundLayer(stackedArea('zero'), inOrder);

    expect(bands(layer)).toEqual(LISTED);
    expect(paths(layer)).toEqual([['Zeta'], ['Alpha'], ['Mid']]);
  });

  it('leaves the bands alone when the paths do not come one per band', () => {
    const layer = boundLayer(stackedArea('zero'), [...STACKED, ...STACKED]);

    expect(bands(layer)).toEqual(LISTED);
  });

  it('leaves the bands alone when the chart is not laid out', () => {
    const flat = STACKED.map(() => ({ left: 0, top: 0, right: 0, bottom: 0 }));

    const layer = boundLayer(stackedArea('zero'), flat);

    expect(bands(layer)).toEqual(LISTED);
  });
});
