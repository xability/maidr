import type { Maidr } from '@type/grammar';
import type { PlotState, SubplotState, TraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';

/**
 * The description dialog's layer tabs jump straight to a layer rather than
 * stepping through the ones between, and do it in silence — the trace's own
 * "Layer 2 of 3" would talk over the open modal. The announcement is deferred
 * to the way out, which is what {@link Subplot.announceActiveLayer} is for.
 */
function threeLayerFigure(): Figure {
  const maidr: Maidr = {
    id: 'layers',
    subplots: [[{
      layers: [
        { id: 'bars', type: TraceType.BAR, name: 'Observed', data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }] },
        { id: 'line', type: TraceType.LINE, name: 'Fitted', data: [[{ x: 'A', y: 3 }, { x: 'B', y: 4 }]] },
        { id: 'more', type: TraceType.LINE, data: [[{ x: 'A', y: 5 }, { x: 'B', y: 6 }]] },
      ],
    }]],
  };
  return new Figure(maidr);
}

/** A single-layer figure, which offers no layer choice at all. */
function oneLayerFigure(): Figure {
  const maidr: Maidr = {
    id: 'one',
    subplots: [[{
      layers: [{ id: 'bars', type: TraceType.BAR, data: [{ x: 'A', y: 1 }] }],
    }]],
  };
  return new Figure(maidr);
}

/** Records every state each layer emits, tagged by its index. */
function record(figure: Figure): string[] {
  const log: string[] = [];
  figure.activeSubplot.traces.flat().forEach((trace, index) => {
    trace.addObserver({
      update: (state: TraceState | PlotState) => log.push(`trace${index}:${state.empty ? 'empty' : 'ok'}`),
    });
  });
  figure.activeSubplot.addObserver({
    update: (state: SubplotState) => log.push(`subplot:${state.empty ? 'empty' : 'ok'}`),
  });
  return log;
}

describe('layer summaries', () => {
  test('names every layer of a multi-layer subplot and marks the active one', () => {
    const subplot = threeLayerFigure().activeSubplot;

    expect(subplot.getLayerSummaries()).toEqual([
      { index: 0, label: 'Observed', isActive: true },
      { index: 1, label: 'Fitted', isActive: false },
      { index: 2, label: 'Line Chart', isActive: false },
    ]);
  });

  test('falls back to the chart type when the producer named no layer', () => {
    // The same fallback order the spoken layer-switch announcement uses, so a
    // tab and the announcement single out the same layer by the same name.
    const summaries = threeLayerFigure().activeSubplot.getLayerSummaries();

    expect(summaries[2].label).toBe('Line Chart');
  });

  test('offers nothing for a single-layer subplot', () => {
    expect(oneLayerFigure().activeSubplot.getLayerSummaries()).toEqual([]);
  });

  test('follows the active layer as it moves', () => {
    const subplot = threeLayerFigure().activeSubplot;

    subplot.switchLayer('UPWARD');

    expect(subplot.getLayerSummaries().map(layer => layer.isActive)).toEqual([false, true, false]);
  });
});

describe('selecting a layer by index', () => {
  test('jumps straight to a layer without stepping through the ones between', () => {
    const subplot = threeLayerFigure().activeSubplot;

    const trace = subplot.selectLayer(2);

    expect(trace).toBe(subplot.traces[2][0]);
    expect(subplot.activeLayerIndex).toBe(2);
  });

  test('says nothing on the way — the dialog is open and would be talked over', () => {
    const figure = threeLayerFigure();
    const log = record(figure);

    figure.activeSubplot.selectLayer(2);

    expect(log).toEqual([]);
  });

  test('carries the reader position across, as a PageUp step does', () => {
    const subplot = threeLayerFigure().activeSubplot;
    subplot.moveOnce('FORWARD');
    const before = subplot.activeTrace!.getCurrentXValue();

    subplot.selectLayer(1);

    expect(subplot.activeTrace!.getCurrentXValue()).toBe(before);
  });

  test('leaves the active layer alone when it is already the one asked for', () => {
    const subplot = threeLayerFigure().activeSubplot;

    expect(subplot.selectLayer(0)).toBe(subplot.traces[0][0]);
    expect(subplot.activeLayerIndex).toBe(0);
  });

  test('refuses an index the subplot has no layer at', () => {
    const subplot = threeLayerFigure().activeSubplot;

    expect(subplot.selectLayer(9)).toBeNull();
    expect(subplot.selectLayer(-1)).toBeNull();
    expect(subplot.activeLayerIndex).toBe(0);
  });

  test('announces the layer it landed on, once, when asked to', () => {
    const figure = threeLayerFigure();
    figure.activeSubplot.selectLayer(1);
    const log = record(figure);

    figure.activeSubplot.announceActiveLayer();

    expect(log).toEqual(['trace1:ok']);
  });
});

describe('context layer selection', () => {
  test('exposes the layers of the subplot the reader is in', () => {
    const context = new Context(threeLayerFigure());

    expect(context.getLayerSummaries().map(layer => layer.label)).toEqual([
      'Observed',
      'Fitted',
      'Line Chart',
    ]);

    context.dispose();
  });

  test('swaps the trace on the stack, so leaving the dialog lands on that layer', () => {
    const figure = threeLayerFigure();
    const context = new Context(figure);

    expect(context.selectTrace(2)).toBe(true);
    expect(context.active).toBe(figure.activeSubplot.traces[2][0]);

    context.dispose();
  });

  test('reports no change when the index is already active or out of range', () => {
    const context = new Context(threeLayerFigure());

    expect(context.selectTrace(0)).toBe(false);
    expect(context.selectTrace(7)).toBe(false);

    context.dispose();
  });

  test('offers no layer choice at the multi-panel lobby', () => {
    const maidr: Maidr = {
      id: 'panels',
      subplots: [[
        { layers: [{ id: 'a', type: TraceType.BAR, data: [{ x: 'A', y: 1 }] }] },
        { layers: [{ id: 'b', type: TraceType.BAR, data: [{ x: 'A', y: 2 }] }] },
      ]],
    };
    const context = new Context(new Figure(maidr));

    expect(context.getLayerSummaries()).toEqual([]);
    expect(context.selectTrace(1)).toBe(false);

    context.dispose();
  });

  test('offers no layer choice while a virtual layer is on top of the stack', () => {
    // The candlestick delta layer reaches the stack through `swapActiveTrace`
    // without being one of the subplot's traces. A switch from the tab strip
    // would pop it behind CandlestickDeltaService's back, and the anchor it
    // swaps in later would silently undo the reader's choice.
    const figure = threeLayerFigure();
    const context = new Context(figure);
    const virtualLayer = new Figure({
      id: 'virtual',
      subplots: [[{ layers: [{ id: 'v', type: TraceType.LINE, data: [[{ x: 'A', y: 1 }]] }] }]],
    } as Maidr).activeSubplot.traces[0][0];

    context.swapActiveTrace(virtualLayer);

    expect(context.getLayerSummaries()).toEqual([]);
    expect(context.selectTrace(1)).toBe(false);

    context.dispose();
  });
});
