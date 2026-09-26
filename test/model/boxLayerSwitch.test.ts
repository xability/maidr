import type { BoxPoint, Maidr, MaidrLayer } from '@type/grammar';
import type { TextState, TraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { BoxplotSection } from '@type/boxplotSection';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Switching layers on a box plot whose sub-groups are layers of their own --
 * what a grouped Nivo, ggplot or seaborn box plot is -- carries the box and the
 * section the reader is on.
 *
 * `BoxTrace` used the generic values-array fallback, which carried the current
 * section's *value* as the X and searched the next layer's quartiles for it.
 * From "group g1, 25%" the reader landed on the first group's lower outliers,
 * which announce nothing: "s1 at group is g0, Y is ".
 */

function box(z: string, base: number): BoxPoint {
  return { z, lowerOutliers: [], min: base, q1: base + 1, q2: base + 2, q3: base + 3, max: base + 4, upperOutliers: [] };
}

function layer(id: string, points: BoxPoint[], orientation?: Orientation): MaidrLayer {
  return {
    id,
    type: TraceType.BOX,
    name: id,
    ...(orientation ? { orientation } : {}),
    axes: orientation === Orientation.HORIZONTAL
      ? { x: { label: 'Y' }, y: { label: 'group' } }
      : { x: { label: 'group' }, y: { label: 'Y' } },
    data: points,
  };
}

function figureOf(...layers: MaidrLayer[]): Figure {
  const maidr: Maidr = { id: 'boxes', subplots: [[{ layers }]] };
  return new Figure(maidr);
}

function textOf(state: TraceState): TextState {
  if (state.empty) {
    throw new Error('expected a non-empty trace state');
  }
  return state.text;
}

describe('switching between box layers', () => {
  test.each([Orientation.VERTICAL, Orientation.HORIZONTAL])('keeps the group and the section (%s)', (orientation) => {
    const figure = figureOf(
      layer('s0', [box('g0', 0), box('g1', 4)], orientation),
      layer('s1', [box('g0', 10), box('g1', 14)], orientation),
    );
    const subplot = figure.activeSubplot;
    const first = subplot.traces[0][0];
    // g1's Q1: (section 2, box 1) vertically, (box 1, section 2) horizontally,
    // where the horizontal trace lists the boxes bottom-up, g1 first.
    if (orientation === Orientation.VERTICAL) {
      first.moveToIndex(2, 1);
    } else {
      first.moveToIndex(0, 2);
    }
    expect(textOf(first.state)).toMatchObject({ main: { value: 'g1' }, cross: { value: 5 }, section: expect.any(String) });
    const q1Label = textOf(first.state).section;

    const next = subplot.switchLayer('UPWARD');

    expect(next).toBe(subplot.traces[1][0]);
    const text = textOf(next!.state);
    expect(text.main.value).toBe('g1');
    expect(text.cross?.value).toBe(15);
    expect(text.section).toBe(q1Label);
  });

  test('finds the group by name when the layers list different groups', () => {
    const figure = figureOf(
      layer('s0', [box('g0', 0), box('g1', 4)]),
      layer('s1', [box('g1', 14)]),
    );
    const subplot = figure.activeSubplot;
    subplot.traces[0][0].moveToIndex(5, 1);

    const next = subplot.switchLayer('UPWARD');
    const text = textOf(next!.state);

    expect(text.main.value).toBe('g1');
    expect(text.cross?.value).toBe(18);
  });

  test('reports the group name, or the position of an unnamed box, as the X', () => {
    const figure = figureOf(layer('s0', [box('g0', 0), box('', 4)]));
    const trace = figure.activeSubplot.traces[0][0];

    trace.moveToIndex(3, 0);
    expect(trace.getCurrentXValue()).toBe('g0');
    trace.moveToIndex(3, 1);
    expect(trace.getCurrentXValue()).toBe(1);
  });

  test('starts a layer the reader has not visited at the lower whisker when only the box is carried', () => {
    const figure = figureOf(layer('s0', [box('g0', 0), box('g1', 4)]));
    const trace = figure.activeSubplot.traces[0][0];

    expect(trace.moveToXValue('g1')).toBe(true);
    expect(textOf(trace.state).cross?.value).toBe(4);
    expect(trace.moveToXValue('missing')).toBe(false);
  });

  test('carries the section by name', () => {
    const figure = figureOf(layer('s0', [box('g0', 0)]));
    const trace = figure.activeSubplot.traces[0][0];
    expect(trace.moveToXValueAndSection?.('g0', BoxplotSection.MAX)).toBe(true);
    expect(trace.getCurrentSection?.()).toBe(BoxplotSection.MAX);
    expect(textOf(trace.state).cross?.value).toBe(4);
  });
});
