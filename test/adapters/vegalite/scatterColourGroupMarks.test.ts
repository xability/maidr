/**
 * The colour groups of a Vega-Lite scatter keep their own marks once MAIDR
 * has inserted highlight copies among them.
 *
 * Each group's points are named by their place in the mark, and MAIDR inserts
 * a hidden copy beside each element a layer's selector names when it reads
 * the layer. Read one after another, a later group's places counted the
 * earlier groups' copies: on py-maidr's Altair iris scatter the versicolor
 * point at 4.9 by 2.4 was outlined on a setosa point at 5.2 by 3.4. The bind
 * pass marks each group's points before MAIDR reads any layer, and leaves a
 * group whose places do not name one drawn mark per point without an outline
 * rather than with another group's.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { Maidr, MaidrLayer } from '@type/grammar';
import { initMaidrOnElement } from '@util/initMaidr';
import { JSDOM } from 'jsdom';
import { bindVegaLite } from '../../../src/vegalite-entry';

jest.mock('@util/initMaidr', () => ({
  initMaidrOnElement: jest.fn(),
}));

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  (initMaidrOnElement as jest.Mock).mockClear();
  warn.mockClear();
});

afterAll(() => {
  warn.mockRestore();
});

const IRIS = [
  { species: 'versicolor', length: 7.0, width: 3.2 },
  { species: 'setosa', length: 5.1, width: 3.5 },
  { species: 'virginica', length: 6.3, width: 3.3 },
  { species: 'setosa', length: 4.9, width: 3.0 },
  { species: 'versicolor', length: 6.4, width: 3.2 },
];

const SPEC: VegaLiteSpec = {
  data: { values: IRIS },
  mark: 'point',
  encoding: {
    x: { field: 'length', type: 'quantitative' },
    y: { field: 'width', type: 'quantitative' },
    color: { field: 'species', type: 'nominal' },
  },
} as unknown as VegaLiteSpec;

/** The same points faceted by panel: A draws rows 0, 2 and 3, B rows 1 and 4. */
const FACET_SPEC: VegaLiteSpec = {
  data: { values: IRIS.map((row, k) => ({ ...row, panel: ['A', 'B', 'A', 'A', 'B'][k] })) },
  facet: { column: { field: 'panel' } },
  spec: { mark: 'point', encoding: SPEC.encoding },
} as unknown as VegaLiteSpec;

/**
 * A chart whose scatter mark draws one path per row, each named by its row.
 * @param drawn - How many of the rows the mark draws, from the first
 * @returns The chart's container and its view
 */
function chart(drawn = IRIS.length): { container: HTMLElement; view: VegaView } {
  const paths = IRIS.slice(0, drawn).map((row, k) => `<path id="row-${k}" data-species="${row.species}"></path>`).join('');
  return chartOf(`<g class="mark-symbol role-mark marks">${paths}</g>`);
}

/**
 * The faceted chart: a cell per panel, its mark drawing the panel's rows in
 * order, each path named by its panel and place.
 * @returns The chart's container and its view
 */
function facetChart(): { container: HTMLElement; view: VegaView } {
  const cell = (panel: string, count: number): string => {
    const paths = Array.from({ length: count }, (_, k) => `<path id="${panel}-${k}"></path>`).join('');
    return `<g><g class="mark-symbol role-mark child_marks">${paths}</g></g>`;
  };
  return chartOf(`<g class="mark-group role-scope cell">${cell('A', 3)}${cell('B', 2)}</g>`);
}

/**
 * A chart drawn as the given SVG, with a view that answers nothing but its
 * container.
 * @param marks - The SVG's content
 * @returns The chart's container and its view
 */
function chartOf(marks: string): { container: HTMLElement; view: VegaView } {
  const dom = new JSDOM(`<!DOCTYPE html><body><div id="chart"><svg>${marks}</svg></div></body>`);
  const container = dom.window.document.querySelector('div') as HTMLElement;
  const view = {
    container: () => container,
    data: (name: string) => {
      throw new Error(`no dataset ${name}`);
    },
    runAsync: async (): Promise<unknown> => view,
    scale: () => undefined,
  } as unknown as VegaView;
  return { container, view };
}

/**
 * Insert a hidden copy beside every element a selector names, as MAIDR does
 * when it reads a layer (`Svg.selectAllElements`).
 * @param container - The chart's container
 * @param selector - The layer's selector
 */
function copyBeside(container: HTMLElement, selector: string): void {
  for (const element of Array.from(container.querySelectorAll(selector))) {
    const copy = element.cloneNode(true) as Element;
    copy.removeAttribute('id');
    copy.setAttribute('data-maidr-owned', 'true');
    element.insertAdjacentElement('afterend', copy);
  }
}

/**
 * Read a layer as MAIDR does: the elements its selector names, then a copy
 * inserted beside each.
 * @param container - The chart's container
 * @param layer - The layer
 * @returns The ids of the elements it names, none when it has no selector
 */
function readLayer(container: HTMLElement, layer: MaidrLayer): string[] {
  if (typeof layer.selectors !== 'string')
    return [];
  const named = Array.from(container.querySelectorAll(layer.selectors));
  copyBeside(container, layer.selectors);
  return named.map(element => element.id);
}

describe('the colour groups of a vega-lite scatter', () => {
  it('name their own points after the groups before them are read', () => {
    const { container, view } = chart();

    bindVegaLite(view, SPEC);
    const maidr = (initMaidrOnElement as jest.Mock).mock.calls[0][0] as Maidr;
    const layers = maidr.subplots[0][0].layers;
    // Read the groups in turn, as MAIDR does, each inserting its copies.
    const read = layers.map(layer => readLayer(container, layer));

    // Before: the second group's places counted the first group's copies.
    expect(layers.map(layer => layer.name)).toEqual(['versicolor', 'setosa', 'virginica']);
    expect(read).toEqual([['row-0', 'row-4'], ['row-1', 'row-3'], ['row-2']]);
  });

  it('are not outlined where their places do not name one drawn mark per point', () => {
    // Two of the five rows drawn: virginica's place, the third, names nothing.
    const { container, view } = chart(2);

    bindVegaLite(view, SPEC);
    const maidr = (initMaidrOnElement as jest.Mock).mock.calls[0][0] as Maidr;
    const layers = maidr.subplots[0][0].layers;
    const read = layers.map(layer => readLayer(container, layer));

    // Before: virginica kept its place, which named the setosa point at row 1
    // once the copies of the groups before it were in.
    expect(read).toEqual([[], [], []]);
    expect(layers.map(layer => layer.selectors)).toEqual([undefined, undefined, undefined]);
    expect(warn.mock.calls.filter(([message]) => String(message).includes('without an outline'))).toHaveLength(3);
  });

  it('name their own points on a scatter of thousands', () => {
    const species = ['setosa', 'versicolor', 'virginica'];
    const rows = Array.from({ length: 3000 }, (_, k) => ({ species: species[k % 3], length: k, width: k % 7 }));
    const paths = rows.map((_, k) => `<path id="row-${k}"></path>`).join('');
    const { container, view } = chartOf(`<g class="mark-symbol role-mark marks">${paths}</g>`);

    bindVegaLite(view, { ...SPEC, data: { values: rows } } as VegaLiteSpec);
    const maidr = (initMaidrOnElement as jest.Mock).mock.calls[0][0] as Maidr;
    const layers = maidr.subplots[0][0].layers;
    const read = layers.map(layer => readLayer(container, layer));

    // Each group is its 1,000 rows, every third from its first.
    expect(layers.map(layer => layer.name)).toEqual(species);
    expect(read).toEqual(species.map((_, g) => rows.flatMap((_, k) => (k % 3 === g ? [`row-${k}`] : []))));
  }, 30000);

  it('name their own points in every panel of a facet', () => {
    const { container, view } = facetChart();

    bindVegaLite(view, FACET_SPEC);
    const maidr = (initMaidrOnElement as jest.Mock).mock.calls[0][0] as Maidr;
    const layers = maidr.subplots.flat().flatMap(subplot => subplot.layers);
    const read = layers.map(layer => readLayer(container, layer));

    // Each group's mark names the whole chart, and its id is its own panel's.
    expect(layers.map(layer => layer.name)).toEqual(['versicolor', 'virginica', 'setosa', 'setosa', 'versicolor']);
    expect(read).toEqual([['A-0'], ['A-1'], ['A-2'], ['B-0'], ['B-1']]);
  });
});
