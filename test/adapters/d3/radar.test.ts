import type { LinePoint } from '@type/grammar';
import { bindD3Radar } from '@adapters/d3/binders/line';
import { bindD3PolarArea } from '@adapters/d3/binders/pie';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

/**
 * Builds an SVG holding one closed `path.radar-area` per series, the way
 * `selectAll('path.radar-area').data(series).join('path')` leaves it after a
 * `d3.lineRadial()` draw.
 */
function buildRadarSvg(series: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="rd-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of series) {
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'radar-area');
    (path as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(path);
  }
  return svg;
}

/** Builds an SVG holding one `path.wedge` per category, as a coxcomb is drawn. */
function buildPolarSvg(data: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="pa-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of data) {
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'wedge');
    (path as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(path);
  }
  return svg;
}

/** One spoke of a series, as the caller binds it. */
function spoke(attribute: string, score: number, model: string): unknown {
  return { attribute, score, model };
}

const MODEL_A = [
  spoke('Speed', 8, 'Model A'),
  spoke('Range', 6, 'Model A'),
  spoke('Comfort', 9, 'Model A'),
];
const MODEL_B = [
  spoke('Speed', 5, 'Model B'),
  spoke('Range', 9, 'Model B'),
  spoke('Comfort', 4, 'Model B'),
];

describe('bindD3Radar', () => {
  test('reads one row per series, with the spoke on x', () => {
    const svg = buildRadarSvg([MODEL_A, MODEL_B]);

    const result = bindD3Radar(svg, {
      selector: 'path.radar-area',
      title: 'Model Comparison',
      axes: { x: 'Attribute', y: 'Score', fill: 'Model' },
      x: 'attribute',
      y: 'score',
      fill: 'model',
    });

    expect(result.layer.type).toBe(TraceType.RADAR);
    expect(result.layer.data).toEqual([
      [
        { x: 'Speed', y: 8, z: 'Model A' },
        { x: 'Range', y: 6, z: 'Model A' },
        { x: 'Comfort', y: 9, z: 'Model A' },
      ],
      [
        { x: 'Speed', y: 5, z: 'Model B' },
        { x: 'Range', y: 9, z: 'Model B' },
        { x: 'Comfort', y: 4, z: 'Model B' },
      ],
    ]);
  });

  test('drops the repeated first vertex a closed outline is drawn with', () => {
    // The repeat is how the polygon shuts, not a spoke: left in, the chart
    // announces four spokes where it has three, and RadarTrace spaces its
    // angles by that count — every announced position rotates off the mark.
    const closed = [...MODEL_A, spoke('Speed', 8, 'Model A')];
    const svg = buildRadarSvg([closed]);

    const result = bindD3Radar(svg, {
      selector: 'path.radar-area',
      x: 'attribute',
      y: 'score',
      fill: 'model',
    });

    const [row] = result.layer.data as LinePoint[][];
    expect(row.map(point => point.x)).toEqual(['Speed', 'Range', 'Comfort']);
  });

  test('keeps a spoke that merely repeats a value', () => {
    // Only a repeated *spoke name* closes the polygon; two spokes scoring the
    // same is ordinary data.
    const svg = buildRadarSvg([[
      spoke('Speed', 7, 'Model A'),
      spoke('Range', 7, 'Model A'),
    ]]);

    const result = bindD3Radar(svg, {
      selector: 'path.radar-area',
      x: 'attribute',
      y: 'score',
      fill: 'model',
    });

    const [row] = result.layer.data as LinePoint[][];
    expect(row).toHaveLength(2);
  });

  test('emits one selector per series, and a legend naming them', () => {
    const svg = buildRadarSvg([MODEL_A, MODEL_B]);

    const result = bindD3Radar(svg, {
      selector: 'path.radar-area',
      x: 'attribute',
      y: 'score',
      fill: 'model',
    });

    // One selector per series: a bare selector matching both outlines at once
    // makes `selectors.length` disagree with the row count, and the model
    // withdraws highlighting rather than highlight the wrong series.
    expect(result.layer.selectors).toEqual([
      '#rd-svg path.radar-area[data-maidr-line-index="0"]',
      '#rd-svg path.radar-area[data-maidr-line-index="1"]',
    ]);
    for (const selector of result.layer.selectors as string[]) {
      expect(svg.ownerDocument.querySelectorAll(selector)).toHaveLength(1);
    }
  });
});

describe('bindD3PolarArea', () => {
  const MONTHS = [
    { month: 'Jan', deaths: 120 },
    { month: 'Feb', deaths: 88 },
    { month: 'Mar', deaths: 210 },
  ];

  test('reads the wedges as one row of spokes', () => {
    const svg = buildPolarSvg(MONTHS);

    const result = bindD3PolarArea(svg, {
      selector: 'path.wedge',
      title: 'Causes of Mortality',
      axes: { x: 'Month', y: 'Deaths' },
      x: 'month',
      y: 'deaths',
    });

    expect(result.layer.type).toBe(TraceType.POLAR_AREA);
    // A single row: a polar area draws one series of wedges around the dial.
    expect(result.layer.data).toEqual([[
      { x: 'Jan', y: 120 },
      { x: 'Feb', y: 88 },
      { x: 'Mar', y: 210 },
    ]]);
  });

  test('unwraps a d3.pie() arc the way the pie binder does', () => {
    const arcs = MONTHS.map((row, index) => ({
      data: row,
      value: row.deaths,
      startAngle: index,
      endAngle: index + 1,
    }));
    const svg = buildPolarSvg(arcs);

    const result = bindD3PolarArea(svg, { selector: 'path.wedge', x: 'month' });

    // The layout has already applied the caller's own `.value(...)`, so the
    // magnitude is read back off the arc rather than guessed off the datum.
    expect(result.layer.data).toEqual([[
      { x: 'Jan', y: 120 },
      { x: 'Feb', y: 88 },
      { x: 'Mar', y: 210 },
    ]]);
  });

  test('highlights every wedge through one scoped selector', () => {
    const svg = buildPolarSvg(MONTHS);

    const result = bindD3PolarArea(svg, { selector: 'path.wedge', x: 'month', y: 'deaths' });

    // With a single row the trace resolves the matches straight onto the
    // spokes, so the count has to be the wedge count exactly.
    expect(result.layer.selectors).toBe('#pa-svg path.wedge');
    const matched = svg.ownerDocument.querySelectorAll(result.layer.selectors as string);
    expect(matched).toHaveLength(MONTHS.length);
  });

  test('names no fill axis: one series of wedges has no fill dimension', () => {
    const svg = buildPolarSvg(MONTHS);

    const result = bindD3PolarArea(svg, {
      selector: 'path.wedge',
      axes: { x: 'Month', y: 'Deaths' },
      x: 'month',
      y: 'deaths',
    });

    expect(result.layer.axes).toEqual({ x: { label: 'Month' }, y: { label: 'Deaths' } });
  });

  test('throws an actionable error when the selector matches no wedges', () => {
    const svg = buildPolarSvg(MONTHS);

    expect(() => bindD3PolarArea(svg, { selector: 'path.slice' }))
      .toThrow(/polar area wedge/);
  });
});

describe('core-model integration', () => {
  test('a polar area layer constructs a navigable Figure', () => {
    const svg = buildPolarSvg([
      { month: 'Jan', deaths: 120 },
      { month: 'Feb', deaths: 88 },
    ]);
    const result = bindD3PolarArea(svg, {
      selector: 'path.wedge',
      title: 'Causes of Mortality',
      axes: { x: 'Month', y: 'Deaths' },
      x: 'month',
      y: 'deaths',
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.POLAR_AREA]);
    });
  });

  test('a radar layer constructs a navigable Figure', () => {
    const svg = buildRadarSvg([MODEL_A, MODEL_B]);
    const result = bindD3Radar(svg, {
      selector: 'path.radar-area',
      title: 'Model Comparison',
      axes: { x: 'Attribute', y: 'Score', fill: 'Model' },
      x: 'attribute',
      y: 'score',
      fill: 'model',
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
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.RADAR]);
    });
  });
});
