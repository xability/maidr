/**
 * @jest-environment jsdom
 */
import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import { afterEach, describe, expect, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

/**
 * Where a circle drawn at the origin and translated into place sits.
 *
 * MUI X Charts draws every scatter marker as
 * `<circle cx="0" cy="0" transform="translate(x, y)">`. Read by `cx`/`cy`
 * alone, every marker sat at (0, 0): the first x column held the whole
 * scatter and every other point had no marker at all.
 */

const POINTS: ScatterPoint[] = [
  { x: 1, y: 1 },
  { x: 1, y: 2 },
  { x: 2, y: 3 },
  { x: 3, y: 4 },
];

function layer(): MaidrLayer {
  return {
    id: 'translated',
    type: TraceType.SCATTER,
    axes: { x: { label: 'x' }, y: { label: 'y' } },
    selectors: 'g#markers > circle',
    data: POINTS,
  };
}

function mount(circles: string[]): void {
  document.body.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg"><g id="markers">${circles.join('')}</g></svg>`;
}

/** How many markers each x column of the highlight holds. */
function columnSizes(trace: ScatterTrace): number[] | null {
  const columns = (trace as unknown as { highlightXValues: SVGElement[][] | null })
    .highlightXValues;
  return columns?.map(column => column.length) ?? null;
}

describe('a scatter circle moved into place by a translate', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('is grouped by where the translate puts it', () => {
    mount([
      '<circle cx="0" cy="0" r="4" transform="translate(65, 255)"></circle>',
      '<circle cx="0" cy="0" r="4" transform="translate(65, 200)"></circle>',
      '<circle cx="0" cy="0" r="4" transform="translate(120, 150)"></circle>',
      '<circle cx="0" cy="0" r="4" transform="translate(180, 20)"></circle>',
    ]);

    expect(columnSizes(new ScatterTrace(layer()))).toEqual([2, 1, 1]);
  });

  test('adds the translate to a circle that also sets its own centre', () => {
    // cx 10 + 50 and cx 60 + 0 are the same drawn x.
    mount([
      '<circle cx="10" cy="5" r="4" transform="translate(50 0)"></circle>',
      '<circle cx="60" cy="9" r="4"></circle>',
      '<circle cx="70" cy="1" r="4"></circle>',
      '<circle cx="80" cy="2" r="4"></circle>',
    ]);

    expect(columnSizes(new ScatterTrace(layer()))).toEqual([2, 1, 1]);
  });
});
