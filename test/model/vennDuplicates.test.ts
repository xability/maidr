/**
 * @jest-environment jsdom
 */
import type { MaidrLayer, VennPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VennTrace } from '@model/venn';
import { TraceType } from '@type/grammar';

/**
 * A region declared twice (#1414).
 *
 * The trace keeps the first region for a set combination and drops the
 * second. The dropped region's drawn area must not be cloned for a highlight
 * nothing will ever show, and the drop must be said out loud.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A, B, A again, and A∩B: four declared regions, one a duplicate. */
const DATA: VennPoint[] = [
  { sets: ['A'], size: 10 },
  { sets: ['B'], size: 8 },
  { sets: ['A'], size: 99 },
  { sets: ['A', 'B'], size: 2 },
];

/**
 * Draws one circle per declared region, in declared order.
 * @param count - How many regions to draw
 */
function draw(count: number): void {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (let at = 0; at < count; at++) {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('class', 'region');
    circle.setAttribute('data-region', String(at));
    svg.appendChild(circle);
  }
  document.body.appendChild(svg);
}

/**
 * Builds the trace against the drawn regions.
 * @returns The trace
 */
function venn(): VennTrace {
  const layer: MaidrLayer = {
    id: 'venn-duplicates',
    type: TraceType.VENN,
    data: DATA,
    selectors: 'circle.region',
  };
  return new VennTrace(layer);
}

/** The highlight clones MAIDR inserted. */
function clones(): Element[] {
  return [...document.querySelectorAll('[data-maidr-owned]')];
}

describe('a set combination declared twice', () => {
  let warn: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    draw(DATA.length);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  test('keeps one region, the first', () => {
    const trace = venn();
    trace.moveOnce('FORWARD');
    const state = trace.state as NonEmptyTraceState;
    expect(state.text.main.value).toBe('A');
    expect(state.text.cross?.value).toBe(10);
    expect(trace.description.dataTable.rows.map(row => row[0])).toEqual(['A', 'B', 'A and B']);
  });

  test('clones only the kept regions, still paired by declared position', () => {
    const trace = venn();
    const owned = clones();
    expect(owned).toHaveLength(3);
    expect(owned.map(one => one.getAttribute('data-region'))).toEqual(['0', '1', '3']);

    const highlight = (trace as unknown as { highlightValues: SVGElement[][] | null }).highlightValues;
    expect(highlight).not.toBeNull();
    expect(highlight!.map(row => row.map(one => one.getAttribute('data-region')))).toEqual([
      ['0', '1'],
      ['3'],
    ]);
  });

  test('warns once, naming the dropped combination', () => {
    venn();
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('[VennTrace]');
    expect(message).toContain('A');
    expect(message).toContain('2');
  });

  test('dispose removes every clone', () => {
    const trace = venn();
    trace.dispose();
    expect(clones()).toHaveLength(0);
    expect(document.querySelectorAll('circle.region')).toHaveLength(DATA.length);
  });
});
