import type { LinePoint } from '@type/grammar';
import { bindD3Parallel } from '@adapters/d3/binders/parallel';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CARS = [
  { name: 'Honda Civic', mpg: 33, hp: 65, weight: 1800 },
  { name: 'Ford Sedan', mpg: 21, hp: 110, weight: 2600 },
  { name: 'Muscle Coupe', mpg: 15, hp: 230, weight: 3400 },
];

/**
 * Builds an SVG holding one `path.observation` per row, the datum bound to it
 * being that whole observation — which is what a parallel coordinates chart
 * binds, since one path crosses every axis.
 */
function buildParallelSvg(rows: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="${SVG_NS}" id="pc-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const row of rows) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'observation');
    (path as unknown as { __data__: unknown }).__data__ = row;
    svg.appendChild(path);
  }
  return svg;
}

describe('bindD3Parallel', () => {
  test('transposes each observation into one point per axis', () => {
    const svg = buildParallelSvg(CARS);

    const result = bindD3Parallel(svg, {
      selector: 'path.observation',
      title: 'Car Characteristics',
      axes: { x: 'Variable', y: 'Value', fill: 'Car' },
      dimensions: ['mpg', 'hp', 'weight'],
    });

    expect(result.layer.type).toBe(TraceType.PARALLEL);
    const data = result.layer.data as LinePoint[][];
    expect(data).toHaveLength(3);
    expect(data[0]).toEqual([
      { x: 'mpg', y: 33, z: 'Honda Civic' },
      { x: 'hp', y: 65, z: 'Honda Civic' },
      { x: 'weight', y: 1800, z: 'Honda Civic' },
    ]);
  });

  test('keeps the declared axis order, not the datum\'s key order', () => {
    // The order the axes are drawn in is the order a reader arrows through
    // them, and an object's keys are not it.
    const svg = buildParallelSvg(CARS);

    const result = bindD3Parallel(svg, {
      selector: 'path.observation',
      dimensions: ['weight', 'mpg'],
    });

    const data = result.layer.data as LinePoint[][];
    expect(data[1].map(point => point.x)).toEqual(['weight', 'mpg']);
    expect(data[1].map(point => point.y)).toEqual([2600, 21]);
  });

  test('reads nested values through a `value` reader', () => {
    const svg = buildParallelSvg([
      { name: 'A', values: { mpg: 30, hp: 70 } },
      { name: 'B', values: { mpg: 18, hp: 190 } },
    ]);

    const result = bindD3Parallel(svg, {
      selector: 'path.observation',
      dimensions: ['mpg', 'hp'],
      value: (d, dimension) => (d as { values: Record<string, number> }).values[dimension],
    });

    const data = result.layer.data as LinePoint[][];
    expect(data[1]).toEqual([
      { x: 'mpg', y: 18, z: 'B' },
      { x: 'hp', y: 190, z: 'B' },
    ]);
  });

  test('says so when an observation is short of a dimension', () => {
    // Dropped instead, the remaining values would shift up one column and
    // every one of them would be announced under the next axis' name.
    const svg = buildParallelSvg([{ name: 'A', mpg: 30 }]);

    expect(() => bindD3Parallel(svg, {
      selector: 'path.observation',
      dimensions: ['mpg', 'hp'],
    })).toThrow(/Dimension "hp" not found/);
  });

  test('says so when no dimensions were declared', () => {
    const svg = buildParallelSvg(CARS);

    expect(() => bindD3Parallel(svg, {
      selector: 'path.observation',
      dimensions: [],
    })).toThrow(/needs its `dimensions`/);
  });

  test('emits one selector per observation', () => {
    const svg = buildParallelSvg(CARS);

    const result = bindD3Parallel(svg, {
      selector: 'path.observation',
      dimensions: ['mpg', 'hp', 'weight'],
    });

    // `ParallelTrace` inherits `LineTrace`'s pairing of one selector per row,
    // so a bare selector matching all three paths withdraws highlighting.
    expect(result.layer.selectors).toEqual([
      '#pc-svg path.observation[data-maidr-line-index="0"]',
      '#pc-svg path.observation[data-maidr-line-index="1"]',
      '#pc-svg path.observation[data-maidr-line-index="2"]',
    ]);
  });

  test('scopes a single observation with one selector', () => {
    const svg = buildParallelSvg([CARS[0]]);

    const result = bindD3Parallel(svg, {
      selector: 'path.observation',
      dimensions: ['mpg', 'hp'],
    });

    expect(result.layer.selectors).toBe('#pc-svg path.observation');
  });

  test('throws an actionable error when the selector matches no observations', () => {
    const svg = buildParallelSvg(CARS);

    expect(() => bindD3Parallel(svg, {
      selector: 'path.line',
      dimensions: ['mpg'],
    })).toThrow(/observation path/);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a navigable Figure', () => {
    const svg = buildParallelSvg(CARS);
    const result = bindD3Parallel(svg, {
      selector: 'path.observation',
      title: 'Car Characteristics',
      axes: { x: 'Variable', y: 'Value', fill: 'Car' },
      dimensions: ['mpg', 'hp', 'weight'],
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
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.PARALLEL]);
    });
  });
});
