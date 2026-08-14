import type { ViolinKdePoint } from '@type/grammar';
import { bindD3Ridgeline } from '@adapters/d3/binders/ridgeline';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One group's kernel density, sampled along the value axis. */
function curve(days: number[], densities: number[]): { days: number; density: number }[] {
  return days.map((day, index) => ({ days: day, density: densities[index] }));
}

const COHORTS = [
  { cohort: '2019', samples: curve([18, 24, 30], [0.005, 0.019, 0.053]) },
  { cohort: '2020', samples: curve([18, 24, 30], [0.012, 0.041, 0.030]) },
];

/**
 * Builds an SVG holding one `path.ridge` per group, the datum bound to it
 * being that group's density curve — the shape `.data(byCohort).join('path')`
 * over `d3.area()` leaves.
 */
function buildRidgelineSvg(groups: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="${SVG_NS}" id="rl-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const group of groups) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'ridge');
    (path as unknown as { __data__: unknown }).__data__ = group;
    svg.appendChild(path);
  }
  return svg;
}

describe('bindD3Ridgeline', () => {
  test('reads one curve per group, keyed by the group\'s name', () => {
    const svg = buildRidgelineSvg(COHORTS);

    const result = bindD3Ridgeline(svg, {
      selector: 'path.ridge',
      title: 'Delivery Time by Cohort',
      axes: { x: 'Days', y: 'Cohort', fill: 'Cohort' },
      group: 'cohort',
      value: 'days',
    });

    expect(result.layer.type).toBe(TraceType.RIDGELINE);
    const data = result.layer.data as ViolinKdePoint[][];
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual([
      { x: '2019', y: 18, density: 0.005 },
      { x: '2019', y: 24, density: 0.019 },
      { x: '2019', y: 30, density: 0.053 },
    ]);
    expect(data[1][1]).toEqual({ x: '2020', y: 24, density: 0.041 });
  });

  test('carries the density the curve was drawn from, not the drawn y', () => {
    // A ridgeline adds each group's baseline to its density before drawing it.
    // The offset is layout, and fed to MAIDR it would make the lowest ridge
    // the loudest — so the binder reads the pre-offset value.
    const svg = buildRidgelineSvg([
      {
        cohort: 'A',
        samples: [
          { days: 10, density: 0.02, drawn: 100.02 },
          { days: 20, density: 0.06, drawn: 100.06 },
        ],
      },
    ]);

    const result = bindD3Ridgeline(svg, {
      selector: 'path.ridge',
      group: 'cohort',
      value: 'days',
      density: 'density',
    });

    const data = result.layer.data as ViolinKdePoint[][];
    expect(data[0].map(point => point.density)).toEqual([0.02, 0.06]);
  });

  test('reads a `d3.groups()` tuple', () => {
    const svg = buildRidgelineSvg([
      ['2019', curve([18, 24], [0.005, 0.019])],
      ['2020', curve([18, 24], [0.012, 0.041])],
    ]);

    const result = bindD3Ridgeline(svg, {
      selector: 'path.ridge',
      value: 'days',
    });

    const data = result.layer.data as ViolinKdePoint[][];
    expect(data[0][0]).toEqual({ x: '2019', y: 18, density: 0.005 });
    expect(data[1][0]).toEqual({ x: '2020', y: 18, density: 0.012 });
  });

  test('names a group from its samples when the group datum is the array', () => {
    const svg = buildRidgelineSvg([
      [{ group: 'Ash', days: 4, density: 0.3 }, { group: 'Ash', days: 8, density: 0.1 }],
    ]);

    const result = bindD3Ridgeline(svg, { selector: 'path.ridge', value: 'days' });

    const data = result.layer.data as ViolinKdePoint[][];
    expect(data[0].map(point => point.x)).toEqual(['Ash', 'Ash']);
  });

  test('says what a missing density means and where to find one', () => {
    const svg = buildRidgelineSvg([
      { cohort: 'A', samples: [{ days: 10, y: 100.02 }] },
    ]);

    expect(() => bindD3Ridgeline(svg, {
      selector: 'path.ridge',
      group: 'cohort',
      value: 'days',
    })).toThrow(/carries no density/);
  });

  test('says so when a path carries no samples at all', () => {
    const svg = buildRidgelineSvg([{ cohort: 'A' }]);

    expect(() => bindD3Ridgeline(svg, { selector: 'path.ridge' }))
      .toThrow(/has no samples/);
  });

  test('emits one scoped selector, which resolves to one element per group', () => {
    const svg = buildRidgelineSvg(COHORTS);

    const result = bindD3Ridgeline(svg, {
      selector: 'path.ridge',
      group: 'cohort',
      value: 'days',
    });

    // `RidgelineTrace` requires exactly one element per group and lights that
    // ridge from any of its samples; the groups are emitted in DOM order, so
    // a single scoped selector is already in the payload's order.
    expect(result.layer.selectors).toBe('#rl-svg path.ridge');
    expect(svg.ownerDocument.querySelectorAll('#rl-svg path.ridge')).toHaveLength(2);
  });

  test('names the groups in the subplot legend', () => {
    const svg = buildRidgelineSvg(COHORTS);

    const result = bindD3Ridgeline(svg, {
      selector: 'path.ridge',
      group: 'cohort',
      value: 'days',
    });

    expect(result.maidr.subplots[0][0].legend).toEqual(['2019', '2020']);
  });

  test('throws an actionable error when the selector matches no curves', () => {
    const svg = buildRidgelineSvg(COHORTS);

    expect(() => bindD3Ridgeline(svg, { selector: 'path.joy' })).toThrow(/ridge curve/);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a Figure that highlights its ridges', () => {
    const svg = buildRidgelineSvg(COHORTS);
    const result = bindD3Ridgeline(svg, {
      selector: 'path.ridge',
      title: 'Delivery Time by Cohort',
      axes: { x: 'Days', y: 'Cohort', fill: 'Cohort' },
      group: 'cohort',
      value: 'days',
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.RIDGELINE]);
    });
  });
});
