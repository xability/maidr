import type { ContourPoint } from '@type/grammar';
import { bindD3Contour } from '@adapters/d3/binders/contour';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A closed GeoJSON ring, first position repeated at the end as the spec has it. */
function ring(positions: number[][]): number[][] {
  return [...positions, positions[0]];
}

/** The `MultiPolygon` `d3.contours()` emits for one threshold. */
function level(value: number, rings: number[][][]): unknown {
  return { type: 'MultiPolygon', value, coordinates: rings.map(one => [one]) };
}

const LEVELS = [
  level(0.1, [ring([[1, 1], [5, 1], [5, 5], [1, 5]])]),
  level(0.2, [ring([[2, 2], [4, 2], [4, 4], [2, 4]])]),
];

/**
 * Builds an SVG holding one `path.contour` per level, the datum bound to it
 * being that threshold's `MultiPolygon`.
 */
function buildContourSvg(levels: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="${SVG_NS}" id="ct-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of levels) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'contour');
    (path as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(path);
  }
  return svg;
}

describe('bindD3Contour', () => {
  test('reads one curve per level, carrying the level on every point', () => {
    const svg = buildContourSvg(LEVELS);

    const result = bindD3Contour(svg, {
      selector: 'path.contour',
      title: 'Density Field',
      axes: { x: 'X', y: 'Y', fill: 'Density' },
    });

    expect(result.layer.type).toBe(TraceType.CONTOUR);
    const data = result.layer.data as ContourPoint[][];
    expect(data).toHaveLength(2);
    // The closing repeat is geometry, not a sample: four corners, not five.
    expect(data[0]).toEqual([
      { x: 1, y: 1, level: 0.1 },
      { x: 5, y: 1, level: 0.1 },
      { x: 5, y: 5, level: 0.1 },
      { x: 1, y: 5, level: 0.1 },
    ]);
    expect(data[1].every(point => point.level === 0.2)).toBe(true);
  });

  test('maps the grid onto the data axes through the given transforms', () => {
    // `d3.contours()` walks a grid and emits INDICES; without the transforms
    // the chart announces its curves in grid cells.
    const svg = buildContourSvg([level(0.1, [ring([[0, 0], [2, 0], [2, 2]])])]);

    const result = bindD3Contour(svg, {
      selector: 'path.contour',
      x: column => -5 + column * 0.5,
      y: row => 100 + row * 10,
    });

    const data = result.layer.data as ContourPoint[][];
    expect(data[0]).toEqual([
      { x: -5, y: 100, level: 0.1 },
      { x: -4, y: 100, level: 0.1 },
      { x: -4, y: 120, level: 0.1 },
    ]);
  });

  test('flattens a level drawn as several disjoint rings into one curve', () => {
    const svg = buildContourSvg([
      level(0.3, [
        ring([[0, 0], [1, 0], [1, 1]]),
        ring([[8, 8], [9, 8], [9, 9]]),
      ]),
    ]);

    const result = bindD3Contour(svg, { selector: 'path.contour' });

    const data = result.layer.data as ContourPoint[][];
    expect(data[0]).toHaveLength(6);
    expect(data[0].map(point => point.x)).toEqual([0, 1, 1, 8, 9, 9]);
  });

  test('reads a bare Polygon as readily as a MultiPolygon', () => {
    const svg = buildContourSvg([
      { type: 'Polygon', value: 0.4, coordinates: [ring([[0, 0], [1, 0], [1, 1]])] },
    ]);

    const result = bindD3Contour(svg, { selector: 'path.contour' });

    const data = result.layer.data as ContourPoint[][];
    expect(data[0]).toHaveLength(3);
    expect(data[0][0]).toEqual({ x: 0, y: 0, level: 0.4 });
  });

  test('emits one selector per level', () => {
    const svg = buildContourSvg(LEVELS);

    const result = bindD3Contour(svg, { selector: 'path.contour' });

    // `ContourTrace` inherits `LineTrace`'s pairing of one selector per row,
    // so a bare selector matching both level paths withdraws highlighting.
    expect(result.layer.selectors).toEqual([
      '#ct-svg path.contour[data-maidr-line-index="0"]',
      '#ct-svg path.contour[data-maidr-line-index="1"]',
    ]);
  });

  test('says so when the paths carry drawing instructions instead of geometry', () => {
    const svg = buildContourSvg([{ value: 0.1, d: 'M1,1L5,1L5,5Z' }]);

    expect(() => bindD3Contour(svg, { selector: 'path.contour' }))
      .toThrow(/carries no rings/);
  });

  test('throws an actionable error when the selector matches no levels', () => {
    const svg = buildContourSvg(LEVELS);

    expect(() => bindD3Contour(svg, { selector: 'path.iso' }))
      .toThrow(/contour level path/);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a navigable Figure', () => {
    const svg = buildContourSvg(LEVELS);
    const result = bindD3Contour(svg, {
      selector: 'path.contour',
      title: 'Density Field',
      axes: { x: 'X', y: 'Y', fill: 'Density' },
    });

    // jsdom 26 does not define `SVGPathElement`, and `LineTrace`'s path-parsing
    // fallback narrows with `instanceof` — so the Figure is built without the
    // selectors here. They are asserted on their own above.
    const { selectors, ...layer } = result.maidr.subplots[0][0].layers[0];
    expect(selectors).toBeDefined();
    const data = { ...result.maidr, subplots: [[{ layers: [layer] }]] };

    withPageDocument(svg, () => {
      const figure = new Figure(data);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.CONTOUR]);
    });
  });
});
