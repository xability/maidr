import type { MosaicPoint } from '@type/grammar';
import { bindD3Mosaic, bindD3Segmented } from '@adapters/d3/binders/segmented';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

/**
 * Builds an SVG holding one `rect.cell` per datum, the way a mosaic is joined
 * from a flattened contingency table.
 */
function buildMosaicSvg(cells: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="mo-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of cells) {
    const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'cell');
    (rect as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(rect);
  }
  return svg;
}

/** A two-way table: survival by passenger class, one row per cell. */
const CELLS = [
  { klass: 'First', share: 0.62, outcome: 'Survived', width: 0.15, n: 203 },
  { klass: 'Second', share: 0.41, outcome: 'Survived', width: 0.21, n: 118 },
  { klass: 'First', share: 0.38, outcome: 'Died', width: 0.15, n: 122 },
  { klass: 'Second', share: 0.59, outcome: 'Died', width: 0.21, n: 167 },
];

describe('bindD3Mosaic', () => {
  test('carries the column width alongside the segment heights', () => {
    const svg = buildMosaicSvg(CELLS);

    const result = bindD3Mosaic(svg, {
      selector: 'rect.cell',
      title: 'Survival by Passenger Class',
      axes: { x: 'Class', y: 'Proportion', fill: 'Outcome' },
      x: 'klass',
      y: 'share',
      fill: 'outcome',
      count: 'n',
    });

    expect(result.layer.type).toBe(TraceType.MOSAIC);
    // Without the width a category of six people and one of six hundred read
    // identically, which is the whole thing a mosaic is drawn to show.
    expect(result.layer.data).toEqual([
      [
        { x: 'First', y: 0.62, z: 'Survived', width: 0.15, count: 203 },
        { x: 'Second', y: 0.41, z: 'Survived', width: 0.21, count: 118 },
      ],
      [
        { x: 'First', y: 0.38, z: 'Died', width: 0.15, count: 122 },
        { x: 'Second', y: 0.59, z: 'Died', width: 0.21, count: 167 },
      ],
    ]);
  });

  test('infers the width from the datum\'s own key names', () => {
    const svg = buildMosaicSvg([
      { x: 'First', y: 0.62, fill: 'Survived', share: 0.15 },
      { x: 'First', y: 0.38, fill: 'Died', share: 0.15 },
    ]);

    const result = bindD3Mosaic(svg, { selector: 'rect.cell' });

    const [survived] = result.layer.data as MosaicPoint[][];
    expect(survived[0]).toEqual({ x: 'First', y: 0.62, z: 'Survived', width: 0.15 });
  });

  test('omits a width the producer does not have, rather than inventing one', () => {
    // A drawn `<rect>` always has a width, but that width is padding and scale
    // as much as data — turning it back into a proportion would announce a
    // number the table does not contain.
    const svg = buildMosaicSvg([
      { x: 'First', y: 0.62, fill: 'Survived' },
      { x: 'First', y: 0.38, fill: 'Died' },
    ]);

    const result = bindD3Mosaic(svg, { selector: 'rect.cell' });

    const [survived] = result.layer.data as MosaicPoint[][];
    expect(survived[0]).toEqual({ x: 'First', y: 0.62, z: 'Survived' });
  });

  test('drops a width that is not a finite number', () => {
    const svg = buildMosaicSvg([
      { x: 'First', y: 0.62, fill: 'Survived', width: Number.NaN },
      { x: 'First', y: 0.38, fill: 'Died', width: 0.15 },
    ]);

    const result = bindD3Mosaic(svg, { selector: 'rect.cell' });

    const [survived, died] = result.layer.data as MosaicPoint[][];
    // NaN would be announced as a share; the column's width is read from
    // whichever series does declare one.
    expect(survived[0].width).toBeUndefined();
    expect(died[0].width).toBe(0.15);
  });

  test('highlights every cell through one scoped selector', () => {
    const svg = buildMosaicSvg(CELLS);

    const result = bindD3Mosaic(svg, {
      selector: 'rect.cell',
      x: 'klass',
      y: 'share',
      fill: 'outcome',
    });

    expect(result.layer.selectors).toBe('#mo-svg rect.cell');
    const matched = svg.ownerDocument.querySelectorAll(result.layer.selectors as string);
    expect(matched).toHaveLength(CELLS.length);
  });
});

describe('bindD3Segmented alongside it', () => {
  test('stays stacked, and reads no width off a datum that has one', () => {
    // The two share an extraction core; a stacked bar whose datum happens to
    // carry a `width` must not pick up a column share it never declared.
    const svg = buildMosaicSvg([
      { x: 'First', y: 0.62, fill: 'Survived', width: 0.15 },
      { x: 'First', y: 0.38, fill: 'Died', width: 0.15 },
    ]);

    const result = bindD3Segmented(svg, { selector: 'rect.cell' });

    expect(result.layer.type).toBe(TraceType.STACKED);
    expect(result.layer.data).toEqual([
      [{ x: 'First', y: 0.62, z: 'Survived' }],
      [{ x: 'First', y: 0.38, z: 'Died' }],
    ]);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a navigable Figure', () => {
    const svg = buildMosaicSvg(CELLS);
    const result = bindD3Mosaic(svg, {
      selector: 'rect.cell',
      title: 'Survival by Passenger Class',
      axes: { x: 'Class', y: 'Proportion', fill: 'Outcome' },
      x: 'klass',
      y: 'share',
      fill: 'outcome',
      count: 'n',
    });

    // jsdom 26 does not define `SVGPathElement`, and `SegmentedTrace`'s SVG
    // mapping narrows with `instanceof` — so the Figure is built without the
    // selectors here. They are asserted on their own above.
    const { selectors, ...layer } = result.maidr.subplots[0][0].layers[0];
    expect(selectors).toBeDefined();
    const data = { ...result.maidr, subplots: [[{ layers: [layer] }]] };

    withPageDocument(svg, () => {
      const figure = new Figure(data);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.MOSAIC]);
    });
  });
});
