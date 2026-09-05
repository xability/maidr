/**
 * @jest-environment jsdom
 */

/**
 * Every hidden clone a trace inserts is gone once the trace is disposed.
 *
 * `Svg.selectAllElements(selector)` clones every match, marks the clone
 * `data-maidr-owned` and inserts it beside the original *before* the trace
 * decides whether it can use it. A trace that then declines the whole list
 * (the count does not fit its points) or keeps only part of it dropped the
 * rest on the floor: `AbstractTrace.dispose()` walks `highlightValues`, and a
 * clone that never reached it was never removed.
 *
 * The cost compounds. Focus-out and focus-in rebuild the controller, and a
 * live-data push rebuilds the figure, so every cycle adds another set of
 * hidden elements to the chart's SVG. Worse, the clones are siblings of the
 * marks they copy, so the next resolution of the same selector matches them
 * too -- the count is wrong again, and a chart that mismatched once can never
 * highlight again (#1004 is the same failure through positional selectors).
 *
 * Two properties, one per case, asserted for every trace that resolves a
 * flat selector list:
 *
 *   - a resolution the trace declines leaves the document as it found it;
 *   - a resolution it accepts is undone in full by `dispose()`, so a second
 *     construction over the same document resolves the same elements.
 */

import type { MaidrLayer } from '@type/grammar';
import { afterEach, describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

const MARK = '.mark';

/** How many MAIDR-owned elements the document holds right now. */
function ownedCount(): number {
  return document.querySelectorAll('[data-maidr-owned]').length;
}

/**
 * Draw `count` marks, each addressable through {@link MARK}.
 * @param count How many marks the chart drew
 */
function draw(count: number): void {
  const marks = Array.from({ length: count }, (_, i) => `<rect class="mark" id="m${i}" />`);
  document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${marks.join('')}</svg>`;
}

/**
 * One row per trace: the layer, minus its selectors, and how many marks its
 * data declares.
 */
interface Case {
  type: TraceType;
  declared: number;
  layer: Omit<MaidrLayer, 'selectors' | 'id' | 'type'>;
}

const CASES: Case[] = [
  {
    type: TraceType.WATERFALL,
    declared: 3,
    layer: {
      axes: { x: { label: 'Step' }, y: { label: 'Amount' } },
      data: [
        { x: 'Opening', start: 0, end: 100, delta: 100, kind: 'total' },
        { x: 'Sales', start: 100, end: 150, delta: 50, kind: 'increase' },
        { x: 'Closing', start: 0, end: 150, delta: 150, kind: 'total' },
      ],
    },
  },
  {
    type: TraceType.ERROR_BAR,
    declared: 2,
    layer: {
      axes: { x: { label: 'Group' }, y: { label: 'Response' } },
      data: [
        { x: 'control', y: 4, yMin: 3, yMax: 5 },
        { x: 'treated', y: 7, yMin: 6, yMax: 8 },
      ],
    },
  },
  {
    type: TraceType.DUMBBELL,
    declared: 2,
    layer: {
      axes: { x: { label: 'Country' }, y: { label: 'Years' } },
      data: {
        points: [
          { x: 'Denmark', start: 71, end: 78 },
          { x: 'Latvia', start: 74, end: 69 },
        ],
      },
    },
  },
  {
    type: TraceType.TREEMAP,
    declared: 2,
    layer: {
      axes: { x: { label: 'Region' }, y: { label: 'Population' } },
      data: [
        { x: 'France', y: 67, path: ['Europe'] },
        { x: 'Japan', y: 125, path: ['Asia'] },
      ],
    },
  },
  {
    type: TraceType.BOXEN,
    declared: 2,
    layer: {
      axes: { x: { label: 'Group' }, y: { label: 'Milliseconds' } },
      data: [
        { z: 'light', median: 50, levels: [{ p: 0.25, lo: 45, hi: 55 }] },
        { z: 'heavy', median: 80, levels: [{ p: 0.25, lo: 70, hi: 90 }] },
      ],
    },
  },
  {
    type: TraceType.CHOROPLETH,
    declared: 2,
    layer: {
      axes: { x: { label: 'State' }, y: { label: 'Rate' } },
      data: [
        { x: 'Washington', y: 10, lat: 47.4, lon: -120.5, neighbors: ['Oregon'] },
        { x: 'Oregon', y: 20, lat: 43.9, lon: -120.6, neighbors: ['Washington'] },
      ],
    },
  },
  {
    type: TraceType.GANTT,
    declared: 2,
    layer: {
      axes: { x: { label: 'Task' }, y: { label: 'Day' } },
      data: {
        points: [
          [{ x: 'Design', start: 0, end: 10 }],
          [{ x: 'Build', start: 10, end: 30 }],
        ],
      },
    },
  },
];

/**
 * Build the trace for a case over a selector addressing every mark.
 * @param one The case
 * @returns The constructed trace
 */
function build(one: Case): ReturnType<typeof TraceFactory.create> {
  return TraceFactory.create({
    id: `test-${one.type}`,
    type: one.type,
    selectors: MARK,
    ...one.layer,
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe.each(CASES)('$type leaves no hidden clone behind', (one) => {
  test('declining a selector list that does not fit leaves the document untouched', () => {
    // One mark too many -- a legend swatch the selector also caught, say.
    draw(one.declared + 1);

    const trace = build(one);

    expect(ownedCount()).toBe(0);
    trace.dispose();
    expect(ownedCount()).toBe(0);
  });

  test('disposing removes every clone it inserted, so a rebuild resolves the same marks', () => {
    draw(one.declared);

    const first = build(one);
    expect(ownedCount()).toBe(one.declared);

    first.dispose();
    expect(ownedCount()).toBe(0);

    const second = build(one);
    expect(ownedCount()).toBe(one.declared);
    second.dispose();
    expect(ownedCount()).toBe(0);
  });
});

describe('a gauge keeps one drawn element and leaves no clone of the others', () => {
  const layer: Omit<MaidrLayer, 'selectors'> = {
    id: 'test-gauge',
    type: TraceType.GAUGE,
    axes: { x: { label: 'Measure' }, y: { label: 'Percent' } },
    data: { value: 73, min: 0, max: 100 },
  };

  test('a selector matching several marks clones only the one it highlights', () => {
    draw(3);

    const trace = TraceFactory.create({ ...layer, selectors: MARK });

    expect(ownedCount()).toBe(1);
    trace.dispose();
    expect(ownedCount()).toBe(0);
  });

  test('a rebuild after dispose resolves the same mark', () => {
    draw(1);

    const first = TraceFactory.create({ ...layer, selectors: MARK });
    first.dispose();
    const second = TraceFactory.create({ ...layer, selectors: MARK });

    expect(ownedCount()).toBe(1);
    second.dispose();
    expect(ownedCount()).toBe(0);
  });
});
