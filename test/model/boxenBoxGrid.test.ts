/**
 * @jest-environment jsdom
 */

/**
 * A boxen whose boxes the layer lists, one row per distribution.
 *
 * A stacked bar chart draws a letter-value ladder as one rectangle in each
 * segment `<Bar>`, so no element holds a distribution's boxes for a producer
 * to name, and a ladder could only be outlined as one of its boxes on every
 * stop. A grid lists them instead, lowest value first, and each stop
 * outlines the box it is read off.
 */

import type { BoxenTrace } from '@model/boxen';
import type { BoxenPoint, MaidrLayer } from '@type/grammar';
import { afterEach, describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A two-rung ladder: five stops, the 12.5th to the 87.5th percentile. */
const TWO_RUNGS: BoxenPoint = {
  z: 'a',
  median: 50,
  levels: [
    { p: 0.25, lo: 40, hi: 60 },
    { p: 0.125, lo: 30, hi: 75 },
  ],
};

/** A one-rung ladder: three stops, the quartiles and the median. */
const ONE_RUNG: BoxenPoint = { z: 'b', median: 50, levels: [{ p: 0.25, lo: 45, hi: 55 }] };

/**
 * Draws the segments as Recharts stacks them: one group per segment, from
 * the base up, each holding one wrapped box per distribution. A distribution
 * with fewer boxes than there are segments has none in the top ones.
 *
 * @param boxes - How many boxes each distribution has
 */
function draw(boxes: number[]): void {
  document.body.innerHTML = `<svg xmlns="${SVG_NS}"></svg>`;
  const svg = document.querySelector('svg');
  for (let segment = 0; segment < Math.max(...boxes); segment++) {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'segment');
    boxes.forEach((count, row) => {
      const wrapper = document.createElementNS(SVG_NS, 'g');
      wrapper.setAttribute('class', 'cell');
      if (segment < count) {
        const box = document.createElementNS(SVG_NS, 'path');
        box.setAttribute('data-name', `${row}:${segment}`);
        wrapper.appendChild(box);
      }
      group.appendChild(wrapper);
    });
    svg?.appendChild(group);
  }
}

/**
 * A boxen layer listing each distribution's boxes by its place.
 *
 * @param data - The distributions
 * @param rows - Each distribution's row of the grid; by default, its boxes
 *   in every segment
 * @returns The trace
 */
function boxen(data: BoxenPoint[], rows?: (string | null)[][]): BoxenTrace {
  const layer: MaidrLayer = {
    id: 'boxen',
    type: TraceType.BOXEN,
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    selectors: rows ?? data.map((_, row) => [`.segment .cell:nth-child(${row + 1}) path`]),
    data,
  };
  return TraceFactory.create(layer) as BoxenTrace;
}

/**
 * The name of what each stop of one distribution outlines, in walking order.
 *
 * @param trace - The trace
 * @param row - Which distribution
 * @returns One name per stop
 */
function outlinedAlong(trace: BoxenTrace, row: number): (string | null)[] {
  const names: (string | null)[] = [];
  for (let col = 0; trace.moveToIndex(row, col); col++) {
    const state = trace.state;
    if (state.empty || state.type !== 'trace' || state.highlight.empty) {
      names.push(null);
      continue;
    }
    const [element] = [state.highlight.elements].flat();
    names.push(element?.getAttribute('data-name') ?? null);
  }
  return names;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a boxen whose boxes the layer lists, lowest value first', () => {
  test('outlines the box each rung is the outer edge of, split at the median', () => {
    // Four boxes for two rungs, one per gap between consecutive positions:
    // 30-40, 40-50, 50-60, 60-75. The median outlines the box above it.
    draw([4]);

    expect(outlinedAlong(boxen([TWO_RUNGS]), 0)).toEqual(['0:0', '0:1', '0:2', '0:2', '0:3']);
  });

  test('outlines the middle box listed on every stop for a row one box short', () => {
    // As a segment left out of the row leaves it, or one of no height where
    // two positions share a value: paired by place, every box from the gap
    // on would be another stop's.
    draw([3]);

    expect(outlinedAlong(boxen([TWO_RUNGS]), 0)).toEqual(Array.from({ length: 5 }, () => '0:1'));
  });

  test('reads each distribution off its own row, however deep its ladder', () => {
    draw([4, 2]);

    const trace = boxen([TWO_RUNGS, ONE_RUNG]);

    expect(outlinedAlong(trace, 0)).toEqual(['0:0', '0:1', '0:2', '0:2', '0:3']);
    expect(outlinedAlong(trace, 1)).toEqual(['1:0', '1:1', '1:1']);
  });

  test('takes the boxes in the order the row lists them', () => {
    // The segments named one cell each, top one first: listed so, the top
    // box is the lowest value's.
    draw([4]);
    const row = [3, 2, 1, 0].map(segment => `.segment:nth-child(${segment + 1}) .cell:nth-child(1) path`);

    expect(outlinedAlong(boxen([TWO_RUNGS], [row]), 0)).toEqual(['0:3', '0:2', '0:1', '0:1', '0:0']);
  });

  test('outlines the middle box listed on every stop for a row of more boxes than gaps', () => {
    draw([5]);

    expect(outlinedAlong(boxen([TWO_RUNGS]), 0)).toEqual(Array.from({ length: 5 }, () => '0:2'));
  });

  test('skips a null cell, which names no box', () => {
    draw([4]);

    const trace = boxen([TWO_RUNGS], [[null, '.segment .cell:nth-child(1) path', null]]);

    expect(outlinedAlong(trace, 0)).toEqual(['0:0', '0:1', '0:2', '0:2', '0:3']);
  });

  test('drops the highlight for a cell that matches nothing', () => {
    draw([4]);

    const trace = boxen([TWO_RUNGS], [['.segment .cell:nth-child(1) path', '.nothing']]);

    expect(outlinedAlong(trace, 0)).toEqual(Array.from({ length: 5 }, () => null));
  });

  test('reads the chart\'s own boxes while copies of an earlier reading are still in it', () => {
    draw([4]);
    boxen([TWO_RUNGS]);

    expect(outlinedAlong(boxen([TWO_RUNGS]), 0)).toEqual(['0:0', '0:1', '0:2', '0:2', '0:3']);
  });

  test('leaves high contrast recolouring every box, as the chart drew it', () => {
    draw([4, 2]);

    const boxes = boxen([TWO_RUNGS, ONE_RUNG]).getAllOriginalElements();

    expect(boxes.map(box => box.getAttribute('data-name'))).toEqual(['0:0', '0:1', '0:2', '0:3', '1:0', '1:1']);
    expect(boxes.every(box => !box.hasAttribute('data-maidr-owned'))).toBe(true);
  });
});
