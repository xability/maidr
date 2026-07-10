import type { Maidr } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { DEFAULT_FIGURE_AXIS, Figure } from '@model/plot';
import { TraceType } from '@type/grammar';

/**
 * End-to-end coverage for the new figure-wide `axes` JSON schema field:
 * `Figure` should parse `maidr.axes.x/y.label` into `FigureState.xAxis`/`yAxis`,
 * falling back to the empty sentinel when unauthored. Other suites mock
 * `Context.figureXAxis`/`figureYAxis`, so this verifies the actual
 * `maidr.axes -> Figure.state` parsing path in `src/model/plot.ts`.
 */
function createMaidr(axes?: Maidr['axes']): Maidr {
  return {
    id: 'axes-test',
    ...(axes && { axes }),
    // Two subplots so this is a genuine multi-panel figure.
    subplots: [
      [{ layers: [{ id: '0', type: TraceType.BAR, data: [{ x: 'A', y: 1 }] }] }],
      [{ layers: [{ id: '1', type: TraceType.BAR, data: [{ x: 'A', y: 2 }] }] }],
    ],
  };
}

describe('Figure figure-wide axes parsing', () => {
  test('parses authored figure-level axes into FigureState', () => {
    const figure = new Figure(createMaidr({ x: { label: 'Year' }, y: { label: 'Revenue' } }));
    const state = figure.state;

    expect(state.empty).toBe(false);
    if (!state.empty) {
      expect(state.xAxis).toBe('Year');
      expect(state.yAxis).toBe('Revenue');
    }
  });

  test('falls back to the empty sentinel when no figure-level axes are authored', () => {
    const figure = new Figure(createMaidr());
    const state = figure.state;

    expect(state.empty).toBe(false);
    if (!state.empty) {
      expect(state.xAxis).toBe(DEFAULT_FIGURE_AXIS);
      expect(state.yAxis).toBe(DEFAULT_FIGURE_AXIS);
      expect(state.xAxis).toBe('');
    }
  });

  test('parses only the authored axis when a single figure axis is given', () => {
    const figure = new Figure(createMaidr({ x: { label: 'Year' } }));
    const state = figure.state;

    if (!state.empty) {
      expect(state.xAxis).toBe('Year');
      expect(state.yAxis).toBe(DEFAULT_FIGURE_AXIS);
    }
  });
});
