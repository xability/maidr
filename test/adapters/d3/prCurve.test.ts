import type { PrCurvePoint } from '@type/grammar';
import { bindD3PrCurve } from '@adapters/d3/binders/prCurve';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

const LOGISTIC = [
  { recall: 0, precision: 1, model: 'Logistic', threshold: 0.9 },
  { recall: 0.6, precision: 0.8, model: 'Logistic', threshold: 0.5 },
  { recall: 1, precision: 0.3, model: 'Logistic' },
];
const FOREST = LOGISTIC.map(row => ({ ...row, model: 'Forest', precision: row.precision - 0.1 }));

/** One `path.pr` per curve, its rows bound as `.data(curves).join('path')` leaves them. */
function buildSvg(curves: unknown[][]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="${SVG_NS}" id="pr-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const curve of curves) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'pr');
    (path as unknown as { __data__: unknown }).__data__ = curve;
    svg.appendChild(path);
  }
  return svg;
}

const BASE = { selector: 'path.pr', x: 'recall', y: 'precision', fill: 'model' } as const;

describe('bindD3PrCurve', () => {
  let warn: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  test('reads a curve per path, each point carrying the threshold it was scored at', () => {
    const result = bindD3PrCurve(buildSvg([LOGISTIC]), { ...BASE, prevalence: 0.3, ap: 0.8 });

    expect(result.layer.type).toBe(TraceType.PR_CURVE);
    expect(result.layer.data as PrCurvePoint[][]).toEqual([[
      { x: 0, y: 1, z: 'Logistic', threshold: 0.9, prevalence: 0.3, ap: 0.8 },
      { x: 0.6, y: 0.8, z: 'Logistic', threshold: 0.5 },
      { x: 1, y: 0.3, z: 'Logistic' },
    ]]);
  });

  test('gives each curve only the baseline keyed to its own name', () => {
    const result = bindD3PrCurve(buildSvg([LOGISTIC, FOREST]), {
      ...BASE,
      prevalence: { Forest: 0.25 },
    });

    const curves = result.layer.data as PrCurvePoint[][];
    expect(curves[0][0].prevalence).toBeUndefined();
    expect(curves[1][0].prevalence).toBe(0.25);
  });

  test('lends one number to no curve of several, and says so', () => {
    const result = bindD3PrCurve(buildSvg([LOGISTIC, FOREST]), { ...BASE, prevalence: 0.3 });

    const curves = result.layer.data as PrCurvePoint[][];
    expect(curves.every(curve => curve[0].prevalence === undefined)).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('prevalence is one number for 2 curves'));
  });

  test('refuses a prevalence written as a percentage', () => {
    const result = bindD3PrCurve(buildSvg([LOGISTIC]), { ...BASE, prevalence: 30 });

    expect((result.layer.data as PrCurvePoint[][])[0][0].prevalence).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('prevalence 30 for "Logistic" is not a number from 0 to 1'));
  });

  test('highlights each curve through its own path, as a line does', () => {
    const result = bindD3PrCurve(buildSvg([LOGISTIC, FOREST]), BASE);

    expect(result.layer.selectors).toHaveLength(2);
  });
});
