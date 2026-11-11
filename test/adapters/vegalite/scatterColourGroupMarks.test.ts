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

/**
 * A chart whose scatter mark draws one path per row, each named by its row.
 * @param drawn - How many of the rows the mark draws, from the first
 * @returns The chart's container and its view
 */
function chart(drawn = IRIS.length): { container: HTMLElement; view: VegaView } {
  const paths = IRIS.slice(0, drawn).map((row, k) => `<path id="row-${k}" data-species="${row.species}"></path>`).join('');
  const dom = new JSDOM(`<!DOCTYPE html><body><div id="chart"><svg><g class="mark-symbol role-mark marks">${paths}</g></svg></div></body>`);
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
});
