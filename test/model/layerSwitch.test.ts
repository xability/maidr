import type { Maidr } from '@type/grammar';
import type { PlotState, SubplotState, TraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';

/**
 * PageUp / PageDown at the edge of a subplot's layers has one answer: the
 * trace's boundary tone and the subplot's "no additional layer". Every extra
 * empty notification is another overlapping tone and a repeated sentence.
 */
function twoLayerFigure(): Figure {
  const maidr: Maidr = {
    id: 'layers',
    subplots: [[{
      layers: [
        { id: 'bars', type: TraceType.BAR, data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }] },
        { id: 'line', type: TraceType.LINE, data: [[{ x: 'A', y: 3 }, { x: 'B', y: 4 }]] },
      ],
    }]],
  };
  return new Figure(maidr);
}

/** Records every state each observed element emits, tagged by its source. */
function record(figure: Figure): { log: string[] } {
  const log: string[] = [];
  const subplot = figure.activeSubplot;
  subplot.addObserver({
    update: (state: SubplotState) => log.push(`subplot:${state.empty ? 'empty' : 'ok'}`),
  });
  subplot.traces.flat().forEach((trace, index) => {
    trace.addObserver({
      update: (state: TraceState | PlotState) => log.push(`trace${index}:${state.empty ? 'empty' : 'ok'}`),
    });
  });
  return { log };
}

describe('stepping between layers', () => {
  test('announces a boundary exactly once for the trace and once for the subplot', () => {
    const figure = twoLayerFigure();
    const subplot = figure.activeSubplot;
    subplot.switchLayer('UPWARD');
    const { log } = record(figure);

    const result = subplot.switchLayer('UPWARD');

    expect(result).toBe(subplot.traces[1][0]);
    expect(log.filter(entry => entry.endsWith(':empty'))).toEqual(['trace1:empty', 'subplot:empty']);
    expect(log.filter(entry => entry.endsWith(':ok'))).toEqual([]);
  });

  test('a successful switch emits no boundary notification', () => {
    const figure = twoLayerFigure();
    const subplot = figure.activeSubplot;
    const { log } = record(figure);

    const result = subplot.switchLayer('UPWARD');

    expect(result).toBe(subplot.traces[1][0]);
    expect(log.filter(entry => entry.endsWith(':empty'))).toEqual([]);
    expect(log).toContain('trace1:ok');
    // The switch is announced from the positioned trace; a subplot state at
    // this point would describe the new trace at its stale column.
    expect(log.filter(entry => entry.startsWith('subplot'))).toEqual([]);
  });

  test('a single-layer subplot cannot switch and reports the boundary once each', () => {
    const figure = new Figure({
      id: 'single',
      subplots: [[{ layers: [{ id: 'bars', type: TraceType.BAR, data: [{ x: 'A', y: 1 }] }] }]],
    });
    const subplot = figure.activeSubplot;
    const { log } = record(figure);

    const result = subplot.switchLayer('DOWNWARD');

    expect(result).toBe(subplot.traces[0][0]);
    expect(log).toEqual(['trace0:empty', 'subplot:empty']);
  });
});
