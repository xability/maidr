import type { LinePoint } from '@type/grammar';
import { bindD3Bump, bindD3Line } from '@adapters/d3/binders/line';
import { describe, expect, test } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/**
 * Builds an SVG holding one `path.series` per series, with the series' point
 * array bound to it the way `selectAll('path.series').data(series).join(...)`
 * would leave it.
 */
function buildSeriesSvg(series: unknown[][]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="line-svg"></svg>`);
  const svg = dom.window.document.querySelector('svg') as unknown as SVGElement;
  for (const points of series) {
    const path = dom.window.document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'series');
    (path as unknown as { __data__: unknown }).__data__ = points;
    svg.appendChild(path);
  }
  return svg;
}

/** Two competitors' ranks over four rounds — one of them overtaking. */
const RANKS: unknown[][] = [
  [
    { round: 'R1', rank: 1, team: 'Ash' },
    { round: 'R2', rank: 2, team: 'Ash' },
    { round: 'R3', rank: 3, team: 'Ash' },
  ],
  [
    { round: 'R1', rank: 3, team: 'Cedar' },
    { round: 'R2', rank: 1, team: 'Cedar' },
    { round: 'R3', rank: 1, team: 'Cedar' },
  ],
];

describe('bindD3Bump', () => {
  test('emits the ranks as bound, one row per competitor', () => {
    const svg = buildSeriesSvg(RANKS);

    const result = bindD3Bump(svg, {
      selector: 'path.series',
      title: 'League Table by Round',
      axes: { x: 'Round', y: 'Rank', fill: 'Team' },
      x: 'round',
      y: 'rank',
      fill: 'team',
    });

    expect(result.layer.type).toBe(TraceType.BUMP);
    // BumpTrace inverts the pitch and derives the moves itself, so the ranks
    // travel exactly as the user bound them — 1 is still the best position.
    expect(result.layer.data).toEqual([
      [
        { x: 'R1', y: 1, z: 'Ash' },
        { x: 'R2', y: 2, z: 'Ash' },
        { x: 'R3', y: 3, z: 'Ash' },
      ],
      [
        { x: 'R1', y: 3, z: 'Cedar' },
        { x: 'R2', y: 1, z: 'Cedar' },
        { x: 'R3', y: 1, z: 'Cedar' },
      ],
    ]);
    expect(result.maidr.subplots[0][0].legend).toEqual(['Ash', 'Cedar']);
  });

  test('stamps one selector per competitor so a single line can be highlighted', () => {
    const svg = buildSeriesSvg(RANKS);

    const result = bindD3Bump(svg, {
      selector: 'path.series',
      x: 'round',
      y: 'rank',
      fill: 'team',
    });

    expect(result.layer.selectors).toEqual([
      '#line-svg path.series[data-maidr-line-index="0"]',
      '#line-svg path.series[data-maidr-line-index="1"]',
    ]);
  });
});

describe('bindD3Line', () => {
  test('still announces itself as a line chart', () => {
    // The bump binder shares this extraction core; the base case must not pick
    // up its type constant.
    const svg = buildSeriesSvg([[{ x: 'Jan', y: 30 }, { x: 'Feb', y: 34 }]]);

    const result = bindD3Line(svg, { selector: 'path.series' });

    expect(result.layer.type).toBe(TraceType.LINE);
    expect((result.layer.data as LinePoint[][])[0]).toHaveLength(2);
    // One path → one scoped selector is enough to highlight it.
    expect(result.layer.selectors).toBe('#line-svg path.series');
  });

  test('withdraws highlighting rather than mis-highlighting an ambiguous series', () => {
    // Shared parent, more paths than fill groups: the path↔series mapping
    // cannot be established, so no selector is emitted at all.
    const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="amb-svg"></svg>`);
    const doc = dom.window.document;
    const svg = doc.querySelector('svg') as unknown as SVGElement;
    for (let i = 0; i < 3; i++) {
      const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'series');
      (path as unknown as { __data__: unknown }).__data__ = [{ x: 'Jan', y: i, fill: 'One' }];
      svg.appendChild(path);
    }
    for (const datum of [{ x: 'Jan', y: 1, fill: 'One' }, { x: 'Feb', y: 2, fill: 'One' }]) {
      const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', 'point');
      (circle as unknown as { __data__: unknown }).__data__ = datum;
      svg.appendChild(circle);
    }

    const result = bindD3Line(svg, { selector: 'path.series', pointSelector: 'circle.point' });

    expect(result.layer.selectors).toBeUndefined();
  });
});
