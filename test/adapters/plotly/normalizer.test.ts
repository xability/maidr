import type { PlotlyFullLayout, PlotlyGraphDiv } from '@adapters/plotly/types';
import type { Maidr } from '@type/grammar';
import { collectUniqueBgRects, normalizePlotlySvg } from '@adapters/plotly/normalizer';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
// @ts-expect-error - jsdom is available transitively (rehype-mathjax → jsdom@22),
// no @types/jsdom installed. Test only uses public Element/JSDOM surface.
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface TestGlobals {
  document?: Document;
  MutationObserver?: typeof MutationObserver;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
}

const globals = globalThis as TestGlobals;
let savedGlobals: TestGlobals;
let dom: JSDOM;

/**
 * `normalizePlotlySvg` uses page globals (document, MutationObserver,
 * requestAnimationFrame); point them at this test's JSDOM window.
 * requestAnimationFrame is a no-op stub so the layout observer's polling
 * loop never spins during tests.
 */
beforeEach(() => {
  dom = new JSDOM('<!doctype html><body></body>');
  savedGlobals = {
    document: globals.document,
    MutationObserver: globals.MutationObserver,
    requestAnimationFrame: globals.requestAnimationFrame,
  };
  globals.document = dom.window.document;
  globals.MutationObserver = dom.window.MutationObserver;
  globals.requestAnimationFrame = () => 0;
});

afterEach(() => {
  for (const key of Object.keys(savedGlobals) as (keyof TestGlobals)[]) {
    if (savedGlobals[key] === undefined) {
      delete globals[key];
    } else {
      (globals as Record<string, unknown>)[key] = savedGlobals[key];
    }
  }
});

/** Builds a plotly-shaped container with a `.bglayer` holding the given rects. */
function createPlotlySvg(
  rects: { x: number; y: number }[],
  fullLayout?: PlotlyFullLayout,
): SVGSVGElement {
  const doc = dom.window.document as Document;
  const div = doc.createElement('div');
  div.className = 'js-plotly-plot';
  if (fullLayout) {
    (div as unknown as PlotlyGraphDiv)._fullLayout = fullLayout;
  }
  const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('class', 'main-svg');
  const bglayer = doc.createElementNS(SVG_NS, 'g');
  bglayer.setAttribute('class', 'bglayer');
  for (const pos of rects) {
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(pos.x));
    rect.setAttribute('y', String(pos.y));
    bglayer.appendChild(rect);
  }
  svg.appendChild(bglayer);
  div.appendChild(svg);
  doc.body.appendChild(div);
  return svg;
}

function createSchema(selectors: (string | undefined)[][]): Maidr {
  return {
    id: 'chart',
    subplots: selectors.map(row =>
      row.map(selector => ({
        ...(selector ? { selector } : {}),
        layers: [{ id: '0', type: TraceType.BAR, data: [{ x: 'a', y: 1 }] }],
      })),
    ),
  };
}

describe('plotly normalizer subplot background wrapping', () => {
  it('wraps each bg rect in a g[id="axes_…"] group in row-major order', () => {
    // Rects appended out of visual order; wrapping must sort them row-major.
    const svg = createPlotlySvg([
      { x: 400, y: 300 },
      { x: 0, y: 0 },
      { x: 0, y: 300 },
      { x: 400, y: 0 },
    ]);
    const schema = createSchema([
      ['g[id="axes_chart_1"]', 'g[id="axes_chart_2"]'],
      ['g[id="axes_chart_3"]', 'g[id="axes_chart_4"]'],
    ]);

    normalizePlotlySvg(svg, schema);

    const groups = Array.from(svg.querySelectorAll('g[id^="axes_"]'));
    expect(groups.map(g => g.id).sort()).toEqual([
      'axes_chart_1',
      'axes_chart_2',
      'axes_chart_3',
      'axes_chart_4',
    ]);
    // Ids are assigned by visual position (row-major), not DOM order:
    // axes_chart_1 wraps the top-left rect, axes_chart_4 the bottom-right.
    const positionOf = (id: string): string => {
      const rect = svg.querySelector(`g[id="${id}"] > rect`)!;
      return `${rect.getAttribute('x')},${rect.getAttribute('y')}`;
    };
    expect(positionOf('axes_chart_1')).toBe('0,0');
    expect(positionOf('axes_chart_2')).toBe('400,0');
    expect(positionOf('axes_chart_3')).toBe('0,300');
    expect(positionOf('axes_chart_4')).toBe('400,300');
  });

  it('skips wrapping when counts disagree and no panel geometry is available', () => {
    const svg = createPlotlySvg([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 0, y: 300 },
    ]);
    const schema = createSchema([
      ['g[id="axes_chart_1"]', 'g[id="axes_chart_2"]'],
    ]);

    normalizePlotlySvg(svg, schema);

    expect(svg.querySelectorAll('g[id^="axes_"]')).toHaveLength(0);
  });

  it('injects transparent panel rects when the bglayer is empty (plotly default styling)', () => {
    const svg = createPlotlySvg([], {
      xaxis: { domain: [0, 0.45], _offset: 80, _length: 300 },
      xaxis2: { domain: [0.55, 1], _offset: 480, _length: 300 },
      yaxis: { domain: [0, 1], _offset: 60, _length: 400 },
      yaxis2: { domain: [0, 1], _offset: 60, _length: 400 },
    });
    const schema = createSchema([
      ['g[id="axes_chart_xy"]', 'g[id="axes_chart_x2y2"]'],
    ]);

    normalizePlotlySvg(svg, schema);

    const groups = Array.from(svg.querySelectorAll('g[id^="axes_"]'));
    expect(groups.map(g => g.id)).toEqual(['axes_chart_xy', 'axes_chart_x2y2']);

    const rect = svg.querySelector('g[id="axes_chart_x2y2"] > rect')!;
    expect(rect.getAttribute('x')).toBe('480');
    expect(rect.getAttribute('y')).toBe('60');
    expect(rect.getAttribute('width')).toBe('300');
    expect(rect.getAttribute('height')).toBe('400');
    expect(rect.getAttribute('fill')).toBe('none');
    expect(rect.getAttribute('pointer-events')).toBe('none');
  });

  it('injects panel rects keyed by axis pair when a dropped panel leaves an extra bg rect', () => {
    // Three rendered rects but only two schema panels (one panel was
    // dropped for unsupported trace types): positional matching is unsafe,
    // so geometry comes from each panel's own axis offsets instead.
    const svg = createPlotlySvg(
      [
        { x: 80, y: 60 },
        { x: 480, y: 60 },
        { x: 880, y: 60 },
      ],
      {
        xaxis: { domain: [0, 0.3], _offset: 80, _length: 300 },
        xaxis2: { domain: [0.35, 0.65], _offset: 480, _length: 300 },
        yaxis: { domain: [0, 1], _offset: 60, _length: 400 },
        yaxis2: { domain: [0, 1], _offset: 60, _length: 400 },
      },
    );
    const schema = createSchema([
      ['g[id="axes_chart_xy"]', 'g[id="axes_chart_x2y2"]'],
    ]);

    normalizePlotlySvg(svg, schema);

    const groups = Array.from(svg.querySelectorAll('g[id^="axes_"]'));
    expect(groups.map(g => g.id)).toEqual(['axes_chart_xy', 'axes_chart_x2y2']);
    const wrapped = svg.querySelector('g[id="axes_chart_xy"] > rect')!;
    expect(wrapped.getAttribute('x')).toBe('80');
    expect(wrapped.getAttribute('y')).toBe('60');

    // The original bg rects stay untouched (direct bglayer children).
    const bglayer = svg.querySelector('.bglayer')!;
    expect(bglayer.querySelectorAll(':scope > rect')).toHaveLength(3);
  });

  it('wraps nothing for single-panel schemas without selectors', () => {
    const svg = createPlotlySvg([{ x: 0, y: 0 }]);
    const schema = createSchema([[undefined]]);

    normalizePlotlySvg(svg, schema);

    expect(svg.querySelectorAll('g[id^="axes_"]')).toHaveLength(0);
  });
});

describe('collectUniqueBgRects', () => {
  it('deduplicates rects sharing a position and sorts row-major', () => {
    const svg = createPlotlySvg([
      { x: 400, y: 0 },
      { x: 0, y: 300 },
      { x: 0, y: 0 },
      { x: 0, y: 0 }, // duplicate
    ]);
    const bglayer = svg.querySelector('.bglayer')!;

    const rects = collectUniqueBgRects(bglayer);

    expect(rects).toHaveLength(3);
    expect(rects.map(r => `${r.getAttribute('x')},${r.getAttribute('y')}`))
      .toEqual(['0,0', '400,0', '0,300']);
  });
});
