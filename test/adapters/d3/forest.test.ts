import type { ForestPoint } from '@type/grammar';
import { bindD3Forest } from '@adapters/d3/binders/errorBar';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { Orientation, TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

/**
 * Builds an SVG holding one `g.study` per study, and — when a pooled row is
 * given — the `path.pooled` diamond a meta-analysis ends with.
 */
function buildForestSvg(studies: unknown[], pooled?: unknown): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="fo-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of studies) {
    const group = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'study');
    (group as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(group);
  }
  if (pooled !== undefined) {
    const diamond = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    diamond.setAttribute('class', 'pooled');
    (diamond as unknown as { __data__: unknown }).__data__ = pooled;
    svg.appendChild(diamond);
  }
  return svg;
}

const STUDIES = [
  { study: 'Silva 2018', or: 0.62, ciLow: 0.41, ciHigh: 0.94, weight: 0.12 },
  { study: 'Nguyen 2020', or: 1.34, ciLow: 0.98, ciHigh: 1.83, weight: 0.08 },
  { study: 'Okafor 2022', or: 1.71, ciLow: 1.22, ciHigh: 2.4, weight: 0.55 },
];

const POOLED = { study: 'Pooled', or: 1.28, ciLow: 1.02, ciHigh: 1.61 };

/** The config the studies above are read with. */
const ACCESSORS = {
  selector: 'g.study',
  x: 'study',
  y: 'or',
  yMin: 'ciLow',
  yMax: 'ciHigh',
} as const;

describe('bindD3Forest', () => {
  test('reads each study\'s estimate, interval and weight', () => {
    const svg = buildForestSvg(STUDIES);

    const result = bindD3Forest(svg, {
      ...ACCESSORS,
      title: 'Effect of the Intervention',
      orientation: Orientation.HORIZONTAL,
      axes: { x: 'Odds ratio', y: 'Study' },
    });

    expect(result.layer.type).toBe(TraceType.FOREST);
    expect(result.layer.data).toEqual([
      { x: 'Silva 2018', y: 0.62, yMin: 0.41, yMax: 0.94, weight: 0.12 },
      { x: 'Nguyen 2020', y: 1.34, yMin: 0.98, yMax: 1.83, weight: 0.08 },
      { x: 'Okafor 2022', y: 1.71, yMin: 1.22, yMax: 2.4, weight: 0.55 },
    ]);
  });

  test('appends the pooled diamond after the studies and marks it', () => {
    // The diamond is a different mark from the whips, so it is selected
    // separately — and it is not one more study, which is what `pooled` says.
    const svg = buildForestSvg(STUDIES, POOLED);

    const result = bindD3Forest(svg, { ...ACCESSORS, pooledSelector: 'path.pooled' });

    const data = result.layer.data as ForestPoint[];
    expect(data).toHaveLength(4);
    expect(data[3]).toEqual({ x: 'Pooled', y: 1.28, yMin: 1.02, yMax: 1.61, pooled: true });
    expect(data.slice(0, 3).every(point => point.pooled === undefined)).toBe(true);
  });

  test('marks a pooled row a chart drew like any other', () => {
    const svg = buildForestSvg([...STUDIES, { ...POOLED, pooled: true }]);

    const result = bindD3Forest(svg, ACCESSORS);

    expect((result.layer.data as ForestPoint[])[3].pooled).toBe(true);
  });

  test('carries the null line only when the caller declared one', () => {
    const svg = buildForestSvg(STUDIES);

    const declared = bindD3Forest(svg, { ...ACCESSORS, nullValue: 1 });
    const silent = bindD3Forest(svg, ACCESSORS);

    // A ratio chart guessed at 0 would report every study as not crossing,
    // so a silent layer makes no claim about significance at all.
    expect(declared.layer.forestOptions).toEqual({ nullValue: 1 });
    expect(silent.layer.forestOptions).toBeUndefined();
  });

  test('omits the weight when the studies declare none', () => {
    const svg = buildForestSvg([{ study: 'Silva 2018', or: 0.62, ciLow: 0.41, ciHigh: 0.94 }]);

    const result = bindD3Forest(svg, ACCESSORS);

    expect((result.layer.data as ForestPoint[])[0].weight).toBeUndefined();
  });

  test('highlights the studies and the diamond, in payload order', () => {
    const svg = buildForestSvg(STUDIES, POOLED);

    const result = bindD3Forest(svg, { ...ACCESSORS, pooledSelector: 'path.pooled' });

    // The trace flattens the list and pairs it one-to-one with the rows, so
    // the studies' selector has to come first — as the rows do.
    expect(result.layer.selectors).toEqual(['#fo-svg g.study', '#fo-svg path.pooled']);
    const matched = [...(result.layer.selectors as string[])]
      .flatMap(one => [...svg.ownerDocument.querySelectorAll(one)]);
    expect(matched).toHaveLength((result.layer.data as ForestPoint[]).length);
  });

  test('refuses a pooled selector that also matches the studies', () => {
    // Both selectors matching one element would emit that row twice, and the
    // doubled selector list would still match the doubled payload — so the
    // only place it can be caught is here.
    const svg = buildForestSvg([...STUDIES, { ...POOLED, pooled: true }]);

    expect(() => bindD3Forest(svg, { ...ACCESSORS, pooledSelector: 'g.study' }))
      .toThrow(/would be emitted twice/);
  });

  test('says what to do when the pooled selector matches nothing', () => {
    const svg = buildForestSvg(STUDIES);

    expect(() => bindD3Forest(svg, { ...ACCESSORS, pooledSelector: 'path.diamond' }))
      .toThrow(/pooled summary/);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a navigable Figure', () => {
    const svg = buildForestSvg(STUDIES, POOLED);
    const result = bindD3Forest(svg, {
      ...ACCESSORS,
      pooledSelector: 'path.pooled',
      title: 'Effect of the Intervention',
      orientation: Orientation.HORIZONTAL,
      axes: { x: 'Odds ratio', y: 'Study' },
      nullValue: 1,
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.FOREST]);
    });
  });
});
