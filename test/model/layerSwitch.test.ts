import type { Maidr } from '@type/grammar';
import type { PlotState, SubplotState, TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
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

  test('a successful switch notifies the entered trace exactly once, as the layer switch', () => {
    // Carrying the reader's position moves the entered trace's cursor, and a
    // move announces itself: every observer heard the point as a move and
    // then again as the switch, and the audio service played its tone twice.
    const figure = twoLayerFigure();
    const subplot = figure.activeSubplot;
    const bars = subplot.traces[0][0];
    bars.moveOnce('FORWARD');
    bars.moveOnce('FORWARD');
    const log: string[] = [];
    subplot.traces.flat().forEach((trace, index) => {
      trace.addObserver({
        update: (state: TraceState | PlotState) => log.push(
          `trace${index}:${state.empty ? 'empty' : 'isLayerSwitch' in state ? 'switch' : 'ok'}`,
        ),
      });
    });

    subplot.switchLayer('UPWARD');

    expect(log).toEqual(['trace1:switch']);
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

  test('a switch onto a layer with no data is announced by the subplot, not as an edge', () => {
    // The trace's empty state is what a step off the edge of the data sends,
    // and every observer read the switch as one: the boundary chord, "No
    // more data to display", and the last layer's highlight left drawn.
    const figure = new Figure({
      id: 'empty-layer',
      subplots: [[{
        layers: [
          { id: 'candles', type: TraceType.CANDLESTICK, data: [] },
          { id: 'volume', type: TraceType.LINE, data: [[{ x: 1, y: 3 }, { x: 2, y: 4 }]] },
        ],
      }]],
    });
    const subplot = figure.activeSubplot;
    subplot.switchLayer('UPWARD');
    const states: PlotState[] = [];
    subplot.addObserver({ update: (state: SubplotState) => states.push(state) });
    subplot.traces.flat().forEach(trace => trace.addObserver({
      update: (state: TraceState | PlotState) => states.push(state),
    }));

    const result = subplot.switchLayer('DOWNWARD');

    expect(result).toBe(subplot.traces[0][0]);
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      empty: false,
      type: 'subplot',
      index: 1,
      size: 2,
      trace: { empty: true, traceType: TraceType.CANDLESTICK },
    });
  });

  test('builds the announced layer state once', () => {
    // The state getter rebuilds audio, braille, text and highlight -- and on
    // some trace types scans every row -- so the layer announcement a
    // PageUp/PageDown step and the description dialog share reads it once.
    const figure = twoLayerFigure();
    const subplot = figure.activeSubplot;
    subplot.switchLayer('UPWARD');
    const { log } = record(figure);
    const line = subplot.traces[1][0];
    const stateSpy = jest.spyOn(line, 'state', 'get');

    subplot.announceActiveLayer();

    expect(stateSpy).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['trace1:ok']);
    stateSpy.mockRestore();
  });
});
