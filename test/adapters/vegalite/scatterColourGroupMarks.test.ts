/**
 * The colour groups of a Vega-Lite scatter keep their own marks once MAIDR
 * has inserted highlight copies among them.
 *
 * Each group's points are named by their place in the mark, and MAIDR inserts
 * a hidden copy beside each element a layer's selector names when it reads
 * the layer. Read one after another, a later group's places counted the
 * earlier groups' copies: on py-maidr's Altair iris scatter the versicolor
 * point at 4.9 by 2.4 was outlined on a setosa point at 5.2 by 3.4. The bind
 * pass marks each group's points before MAIDR reads any layer.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { Maidr } from '@type/grammar';
import { initMaidrOnElement } from '@util/initMaidr';
import { JSDOM } from 'jsdom';
import { bindVegaLite } from '../../../src/vegalite-entry';

jest.mock('@util/initMaidr', () => ({
  initMaidrOnElement: jest.fn(),
}));

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
 * @returns The chart's container and its view
 */
function chart(): { container: HTMLElement; view: VegaView } {
  const paths = IRIS.map((row, k) => `<path id="row-${k}" data-species="${row.species}"></path>`).join('');
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

describe('the colour groups of a vega-lite scatter', () => {
  it('name their own points after the groups before them are read', () => {
    const { container, view } = chart();

    bindVegaLite(view, SPEC);
    const maidr = (initMaidrOnElement as jest.Mock).mock.calls[0][0] as Maidr;
    const layers = maidr.subplots[0][0].layers;
    // Read the groups in turn, as MAIDR does, each inserting its copies.
    const read = layers.map((layer) => {
      const named = Array.from(container.querySelectorAll(layer.selectors as string));
      copyBeside(container, layer.selectors as string);
      return named.map(element => element.id);
    });

    // Before: the second group's places counted the first group's copies.
    expect(layers.map(layer => layer.name)).toEqual(['versicolor', 'setosa', 'virginica']);
    expect(read).toEqual([['row-0', 'row-4'], ['row-1', 'row-3'], ['row-2']]);
  });
});
