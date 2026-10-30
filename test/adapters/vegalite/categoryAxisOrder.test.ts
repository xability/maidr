/**
 * @jest-environment jsdom
 */

/**
 * Error bars, dot plots, dumbbells and parallel coordinates are read in the
 * order their category axis draws them, not in the order of the rows.
 *
 * Vega-Lite sorts a nominal axis, and draws one mark per row in the rows'
 * order. The bind-time passes that put a layer into drawn order reached bars,
 * segmented bars, histograms, heatmaps and lines only, so on the gallery's
 * error bar example Right went from Manchuria (middle) to Glabron (left) to
 * Velvet (right); the dumbbell from Chile (middle) to Mexico (bottom) to
 * Canada (top); a repeated dot panel jumped left, right, middle; and the
 * parallel coordinates read their axes mpg, hp, weight while drawing them hp,
 * mpg, weight.
 *
 * jsdom lays nothing out, so each mark's rect is stubbed with where Vega drew
 * it; without that `isLaidOutForSort` declines and no pass runs at all.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { BarPoint, DumbbellData, ErrorBarPoint, LinePoint, Maidr, MaidrLayer } from '@type/grammar';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { initMaidrOnElement } from '@util/initMaidr';
import { bindVegaLite } from '../../../src/vegalite-entry';
import { makeView } from './fixtures/testView';

jest.mock('@util/initMaidr', () => ({ initMaidrOnElement: jest.fn() }));
const initMock = initMaidrOnElement as unknown as jest.Mock;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Where an element is drawn. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Create an SVG element with a stubbed layout and append it.
 * @param parent - Where to append it
 * @param tag    - Its tag
 * @param box    - Where it is drawn
 * @param classes - Its classes, if any
 * @returns The element
 */
function drawn(parent: Element, tag: string, box: Box, classes?: string): SVGGraphicsElement {
  const element = document.createElementNS(SVG_NS, tag) as SVGGraphicsElement;
  if (classes)
    element.setAttribute('class', classes);
  element.getBoundingClientRect = (): DOMRect => ({
    ...box,
    top: box.y,
    left: box.x,
    right: box.x + box.width,
    bottom: box.y + box.height,
  }) as DOMRect;
  parent.appendChild(element);
  return element;
}

/**
 * Create an SVG group and append it.
 * @param parent  - Where to append it
 * @param classes - Its classes, if any
 * @returns The group
 */
function group(parent: Element, classes?: string): Element {
  const g = document.createElementNS(SVG_NS, 'g');
  if (classes)
    g.setAttribute('class', classes);
  parent.appendChild(g);
  return g;
}

/**
 * A chart container with an empty SVG, attached to the document.
 * @returns The container and its SVG
 */
function canvas(): { container: HTMLElement; svg: Element } {
  const container = document.createElement('div');
  container.id = 'chart';
  const svg = document.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);
  document.body.appendChild(container);
  return { container, svg };
}

/**
 * A view that reports the container, answering for the given datasets.
 * @param container - The chart container
 * @param datasets  - The compiled datasets, if any
 * @returns The view
 */
function viewOf(container: HTMLElement, datasets: Record<string, unknown[]> = {}): VegaView {
  return { ...makeView(datasets), container: () => container } as unknown as VegaView;
}

/**
 * Bind a spec and hand back its only layer.
 * @param view - The view to bind
 * @param spec - The spec
 * @returns The layer
 */
function boundLayer(view: VegaView, spec: VegaLiteSpec): MaidrLayer {
  initMock.mockClear();
  bindVegaLite(view, spec);
  const maidr = initMock.mock.calls[0]?.[0] as Maidr | undefined;
  const layer = maidr?.subplots?.[0]?.[0]?.layers?.[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer;
}

afterEach(() => {
  initMock.mockClear();
  document.body.innerHTML = '';
});

describe('a vega-lite error bar', () => {
  // The gallery example's rows: Manchuria first, though the axis sorts it
  // between Glabron and Velvet.
  const rows = [
    { variety: 'Manchuria', yield: 27 },
    { variety: 'Manchuria', yield: 32.4 },
    { variety: 'Glabron', yield: 43.1 },
    { variety: 'Glabron', yield: 55.2 },
    { variety: 'Velvet', yield: 30.5 },
    { variety: 'Velvet', yield: 47.3 },
  ];
  const drawnAt: Record<string, number> = { Glabron: 114, Manchuria: 247, Velvet: 380 };
  const spec = {
    data: { values: rows },
    mark: 'errorbar',
    encoding: {
      x: { field: 'variety', type: 'nominal' },
      y: { field: 'yield', type: 'quantitative' },
    },
  } as unknown as VegaLiteSpec;

  it('is read left to right as the axis draws it', () => {
    const { container, svg } = canvas();
    const whips = group(svg, 'mark-rule role-mark marks');
    for (const variety of ['Manchuria', 'Glabron', 'Velvet']) {
      drawn(whips, 'line', { x: drawnAt[variety], y: 100, width: 0, height: 50 })
        .setAttribute('data-variety', variety);
    }

    const layer = boundLayer(viewOf(container), spec);

    // Before the fix: Manchuria, Glabron, Velvet.
    expect((layer.data as ErrorBarPoint[]).map(point => point.x)).toEqual(['Glabron', 'Manchuria', 'Velvet']);
    expect([...whips.children].map(line => line.getAttribute('data-variety')))
      .toEqual(['Glabron', 'Manchuria', 'Velvet']);
  });

  it('is left as it is when the rows already come in the drawn order', () => {
    const { container, svg } = canvas();
    const whips = group(svg, 'mark-rule role-mark marks');
    const drawnInOrder: Record<string, number> = { Manchuria: 114, Glabron: 247, Velvet: 380 };
    for (const variety of ['Manchuria', 'Glabron', 'Velvet']) {
      drawn(whips, 'line', { x: drawnInOrder[variety], y: 100, width: 0, height: 50 })
        .setAttribute('data-variety', variety);
    }
    const before = [...whips.children];

    const layer = boundLayer(viewOf(container), spec);

    expect((layer.data as ErrorBarPoint[]).map(point => point.x)).toEqual(['Manchuria', 'Glabron', 'Velvet']);
    expect([...whips.children]).toEqual(before);
  });
});

describe('a vega-lite dot plot', () => {
  it('reads each category\'s dots together, in the order the axis draws them', () => {
    const rows = [
      { variety: 'Manchuria', yield: 32.9 },
      { variety: 'Velvet', yield: 38.5 },
      { variety: 'Peatland', yield: 34.5 },
      { variety: 'Manchuria', yield: 28.9 },
      { variety: 'Velvet', yield: 25.1 },
      { variety: 'Peatland', yield: 31.2 },
    ];
    const drawnAt: Record<string, number> = { Manchuria: 129, Peatland: 269, Velvet: 409 };
    const { container, svg } = canvas();
    const dots = group(svg, 'mark-symbol role-mark marks');
    for (const row of rows)
      drawn(dots, 'path', { x: drawnAt[row.variety], y: 200 - row.yield, width: 5, height: 5 });
    const spec = {
      data: { values: rows },
      mark: 'point',
      encoding: {
        x: { field: 'variety', type: 'nominal' },
        y: { field: 'yield', type: 'quantitative' },
      },
    } as unknown as VegaLiteSpec;

    const layer = boundLayer(viewOf(container), spec);

    expect(layer.type).toBe('dot');
    // Before the fix: Manchuria, Velvet, Peatland, Manchuria, ...
    expect((layer.data as BarPoint[]).map(point => `${point.x} ${point.y}`)).toEqual([
      'Manchuria 32.9',
      'Manchuria 28.9',
      'Peatland 34.5',
      'Peatland 31.2',
      'Velvet 38.5',
      'Velvet 25.1',
    ]);
  });
});

describe('a vega-lite dumbbell', () => {
  // The gallery's ranged dot plot: rows Chile, Mexico, Canada, drawn top to
  // bottom Canada, Chile, Mexico.
  const rows = [
    { country: 'Chile', year: 1995, life: 75.1 },
    { country: 'Chile', year: 2000, life: 77.3 },
    { country: 'Mexico', year: 1995, life: 73.5 },
    { country: 'Mexico', year: 2000, life: 74.8 },
    { country: 'Canada', year: 1995, life: 78 },
    { country: 'Canada', year: 2000, life: 79.2 },
  ];
  const drawnAt: Record<string, number> = { Canada: 60, Chile: 150, Mexico: 240 };
  const spec = {
    data: { values: rows },
    encoding: {
      x: { field: 'life', type: 'quantitative' },
      y: { field: 'country', type: 'nominal' },
    },
    layer: [
      { mark: 'line', encoding: { detail: { field: 'country', type: 'nominal' } } },
      { mark: { type: 'point', filled: true }, encoding: { color: { field: 'year', type: 'ordinal' } } },
    ],
  } as unknown as VegaLiteSpec;

  /**
   * The dumbbell as Vega draws it: each connector in a path group of its own,
   * in the rows' order, and the dots in one group drawn after them.
   * @param upright - Whether the countries run along x, each connector upright
   * @returns The view, the groups' parent and the dot group
   */
  function rendered(upright = false): { view: VegaView; content: Element; dots: Element } {
    const { container, svg } = canvas();
    const content = group(svg);
    for (const country of ['Chile', 'Mexico', 'Canada']) {
      const pathgroup = group(content, 'mark-group role-scope layer_0_pathgroup');
      pathgroup.setAttribute('data-country', country);
      const marks = group(group(pathgroup), 'mark-line role-mark layer_0_marks');
      drawn(marks, 'path', upright
        ? { x: drawnAt[country], y: 70, width: 0, height: 100 }
        : { x: 70, y: drawnAt[country], width: 100, height: 0 });
    }
    const dots = group(content, 'mark-symbol role-mark layer_1_marks');
    return { view: viewOf(container), content, dots };
  }

  it('is read top to bottom as the axis draws it', () => {
    const { view, content } = rendered();

    const layer = boundLayer(view, spec);

    // Before the fix: Chile, Mexico, Canada.
    expect((layer.data as DumbbellData).points.map(point => point.x)).toEqual(['Canada', 'Chile', 'Mexico']);
    expect([...content.children].filter(child => child.hasAttribute('data-country'))
      .map(child => child.getAttribute('data-country'))).toEqual(['Canada', 'Chile', 'Mexico']);
  });

  it('is read left to right when the countries run along x', () => {
    const { view } = rendered(true);
    const upright = {
      ...spec,
      encoding: {
        x: { field: 'country', type: 'nominal' },
        y: { field: 'life', type: 'quantitative' },
      },
    } as unknown as VegaLiteSpec;

    const layer = boundLayer(view, upright);

    expect((layer.data as DumbbellData).points.map(point => point.x)).toEqual(['Canada', 'Chile', 'Mexico']);
  });

  it('keeps marks and points in the drawn order when two marks share a group', () => {
    // Chile's and Mexico's connectors nested in one group cannot be moved
    // apart, so sorting the points alone would pair them with other marks.
    const { container, svg } = canvas();
    const content = group(svg);
    const shared = group(content, 'mark-group role-scope layer_0_pathgroup');
    const own = group(content, 'mark-group role-scope layer_0_pathgroup');
    for (const [country, parent] of [['Chile', shared], ['Mexico', shared], ['Canada', own]] as const) {
      const marks = group(group(parent), 'mark-line role-mark layer_0_marks');
      drawn(marks, 'path', { x: 70, y: drawnAt[country], width: 100, height: 0 });
    }
    group(content, 'mark-symbol role-mark layer_1_marks');

    const layer = boundLayer(viewOf(container), spec);

    expect((layer.data as DumbbellData).points.map(point => point.x)).toEqual(['Chile', 'Mexico', 'Canada']);
  });

  it('keeps the connectors where they are drawn, under the dots', () => {
    const { view, content, dots } = rendered();

    boundLayer(view, spec);

    // Appending the connector groups would put them after the dot group,
    // and so draw the lines over the dots.
    expect(content.lastElementChild).toBe(dots);
  });
});

describe('a vega-lite parallel coordinates plot', () => {
  it('reads every observation\'s axes in the order they are drawn', () => {
    // The gallery recipe: folded in the order mpg, hp, weight, drawn on an
    // axis Vega-Lite sorts to hp, mpg, weight.
    const folded = [
      { name: 'car A', index: 1, key: 'mpg', value: 33 },
      { name: 'car A', index: 1, key: 'hp', value: 65 },
      { name: 'car A', index: 1, key: 'weight', value: 1800 },
      { name: 'car B', index: 2, key: 'mpg', value: 21 },
      { name: 'car B', index: 2, key: 'hp', value: 110 },
      { name: 'car B', index: 2, key: 'weight', value: 2600 },
    ];
    const spec = {
      transform: [
        { window: [{ op: 'count', as: 'index' }] },
        { fold: ['mpg', 'hp', 'weight'] },
      ],
      layer: [
        { mark: 'rule', encoding: { detail: { aggregate: 'count' }, x: { field: 'key' } } },
        {
          mark: 'line',
          encoding: {
            color: { field: 'name', type: 'nominal' },
            detail: { field: 'index', type: 'nominal' },
            x: { field: 'key', type: 'nominal' },
            y: { field: 'value', type: 'quantitative' },
          },
        },
      ],
    } as unknown as VegaLiteSpec;
    const { container, svg } = canvas();
    for (let car = 0; car < 2; car++)
      group(svg, 'mark-line role-mark layer_1_marks').appendChild(document.createElementNS(SVG_NS, 'path'));
    const axis = group(svg, 'role-axis');
    ['hp', 'mpg', 'weight'].forEach((label, at) => {
      drawn(axis, 'text', { x: 50 + at * 100, y: 220, width: 10, height: 12 }).textContent = label;
    });

    const layer = boundLayer(viewOf(container, { data_0: folded }), spec);

    expect(layer.type).toBe('parallel_coordinates');
    // Before the fix: mpg, hp, weight for both.
    expect((layer.data as LinePoint[][]).map(row => row.map(point => point.x))).toEqual([
      ['hp', 'mpg', 'weight'],
      ['hp', 'mpg', 'weight'],
    ]);
  });
});
