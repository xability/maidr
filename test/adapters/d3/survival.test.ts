import type { SurvivalPoint } from '@type/grammar';
import { bindD3Survival } from '@adapters/d3/binders/survival';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CONTROL = [
  { time: 0, surv: 1, arm: 'Control', lower: 0.88, upper: 1 },
  { time: 6, surv: 0.71, arm: 'Control', lower: 0.59, upper: 0.83 },
  { time: 12, surv: 0.41, arm: 'Control', lower: 0.29, upper: 0.53 },
];

const TREATMENT = [
  { time: 0, surv: 1, arm: 'Treatment', lower: 0.9, upper: 1 },
  { time: 6, surv: 0.86, arm: 'Treatment', lower: 0.74, upper: 0.95 },
  { time: 12, surv: 0.68, arm: 'Treatment', lower: 0.54, upper: 0.8 },
];

/**
 * Builds an SVG holding one `path.km` per arm — the datum bound to it being
 * that arm's samples, as `.data(arms).join('path')` over a step generator
 * leaves it — plus an optional separate join of `line.censor` ticks.
 */
function buildSurvivalSvg(arms: unknown[][], ticks: unknown[] = []): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="${SVG_NS}" id="km-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const arm of arms) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'km');
    (path as unknown as { __data__: unknown }).__data__ = arm;
    svg.appendChild(path);
  }
  for (const tick of ticks) {
    const mark = doc.createElementNS(SVG_NS, 'line');
    mark.setAttribute('class', 'censor');
    (mark as unknown as { __data__: unknown }).__data__ = tick;
    svg.appendChild(mark);
  }
  return svg;
}

/** The config every case shares, so each one only states its own variable. */
const BASE = {
  selector: 'path.km',
  x: 'time',
  y: 'surv',
  fill: 'arm',
  yMin: 'lower',
  yMax: 'upper',
} as const;

describe('bindD3Survival', () => {
  test('reads one curve per arm, with the confidence band alongside', () => {
    const svg = buildSurvivalSvg([CONTROL, TREATMENT]);

    const result = bindD3Survival(svg, {
      ...BASE,
      title: 'Overall Survival',
      axes: { x: 'Months', y: 'Survival probability', fill: 'Arm' },
    });

    expect(result.layer.type).toBe(TraceType.SURVIVAL);
    const data = result.layer.data as SurvivalPoint[][];
    expect(data).toHaveLength(2);
    expect(data[0][0]).toEqual({
      x: 0,
      y: 1,
      z: 'Control',
      yMin: 0.88,
      yMax: 1,
    });
    expect(data[1][2]).toEqual({
      x: 12,
      y: 0.68,
      z: 'Treatment',
      yMin: 0.54,
      yMax: 0.8,
    });
  });

  test('flags a censored time the curve already has a vertex at', () => {
    const svg = buildSurvivalSvg([CONTROL], [{ time: 6, arm: 'Control' }]);

    const result = bindD3Survival(svg, { ...BASE, censoredSelector: 'line.censor' });

    const arm = (result.layer.data as SurvivalPoint[][])[0];
    expect(arm).toHaveLength(3);
    expect(arm[1].censored).toBe(true);
    expect(arm[0].censored).toBeUndefined();
  });

  test('inserts a censored time between two vertices, holding the estimate', () => {
    // A censoring tick is not a step: the curve does not move there, so the
    // inserted point carries the probability held across the interval it
    // falls in — and the band that goes with it.
    const svg = buildSurvivalSvg([CONTROL], [{ time: 9, arm: 'Control' }]);

    const result = bindD3Survival(svg, { ...BASE, censoredSelector: 'line.censor' });

    const arm = (result.layer.data as SurvivalPoint[][])[0];
    expect(arm).toHaveLength(4);
    expect(arm[2]).toEqual({
      x: 9,
      y: 0.71,
      z: 'Control',
      yMin: 0.59,
      yMax: 0.83,
      censored: true,
    });
    expect(arm.map(point => point.x)).toEqual([0, 6, 9, 12]);
  });

  test('merges each tick into the arm it names', () => {
    const svg = buildSurvivalSvg(
      [CONTROL, TREATMENT],
      [{ time: 9, arm: 'Treatment' }, { time: 3, arm: 'Control' }],
    );

    const result = bindD3Survival(svg, { ...BASE, censoredSelector: 'line.censor' });

    const [control, treatment] = result.layer.data as SurvivalPoint[][];
    expect(control.map(point => point.x)).toEqual([0, 3, 6, 12]);
    expect(control[1].censored).toBe(true);
    expect(treatment.map(point => point.x)).toEqual([0, 6, 9, 12]);
    expect(treatment[2].censored).toBe(true);
  });

  test('says so when a tick names an arm the chart does not draw', () => {
    const svg = buildSurvivalSvg([CONTROL], [{ time: 9, arm: 'Placebo' }]);

    expect(() => bindD3Survival(svg, { ...BASE, censoredSelector: 'line.censor' }))
      .toThrow(/names the arm "Placebo"/);
  });

  test('says so when a tick names no arm on a multi-arm chart', () => {
    // Merged into the first arm, it would announce a subject leaving a study
    // they were never in — and nothing downstream could tell.
    const svg = buildSurvivalSvg([CONTROL, TREATMENT], [{ time: 9 }]);

    expect(() => bindD3Survival(svg, {
      ...BASE,
      fill: 'arm',
      censoredSelector: 'line.censor',
      x: 'time',
    })).toThrow(/names no arm/);
  });

  test('reads censoring off the curve\'s own samples when it is a column', () => {
    const svg = buildSurvivalSvg([[
      { time: 0, surv: 1, censored: 0 },
      { time: 4, surv: 0.9, censored: 1 },
      { time: 8, surv: 0.9, censored: '0' },
    ]]);

    const result = bindD3Survival(svg, { selector: 'path.km', x: 'time', y: 'surv' });

    const arm = (result.layer.data as SurvivalPoint[][])[0];
    // `'0'` is truthy, and reading the flag by truthiness would censor the
    // last time — a subject who is recorded as having had the event.
    expect(arm.map(point => point.censored)).toEqual([undefined, true, undefined]);
  });

  test('emits one selector per arm, which is what the trace pairs rows with', () => {
    const svg = buildSurvivalSvg([CONTROL, TREATMENT]);

    const result = bindD3Survival(svg, BASE);

    expect(result.layer.selectors).toEqual([
      '#km-svg path.km[data-maidr-line-index="0"]',
      '#km-svg path.km[data-maidr-line-index="1"]',
    ]);
  });

  test('names the arms in the subplot legend', () => {
    const svg = buildSurvivalSvg([CONTROL, TREATMENT]);

    const result = bindD3Survival(svg, BASE);

    expect(result.maidr.subplots[0][0].legend).toEqual(['Control', 'Treatment']);
  });

  test('throws an actionable error when the censoring selector matches nothing', () => {
    const svg = buildSurvivalSvg([CONTROL]);

    expect(() => bindD3Survival(svg, { ...BASE, censoredSelector: 'line.tick' }))
      .toThrow(/censoring tick/);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a navigable Figure', () => {
    const svg = buildSurvivalSvg([CONTROL, TREATMENT], [{ time: 9, arm: 'Control' }]);
    const result = bindD3Survival(svg, {
      ...BASE,
      title: 'Overall Survival',
      axes: { x: 'Months', y: 'Survival probability', fill: 'Arm' },
      censoredSelector: 'line.censor',
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
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.SURVIVAL]);
    });
  });
});
