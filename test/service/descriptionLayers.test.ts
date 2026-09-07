import type { DisplayService } from '@service/display';
import type { Maidr } from '@type/grammar';
import type { PlotState, TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { DescriptionService } from '@service/description';
import { TraceType } from '@type/grammar';

/**
 * The description used to speak for whichever layer the reader happened to be
 * on and never said the others existed. It now carries all of them, and can
 * switch between them — a real switch, so leaving the dialog lands the reader
 * on the layer they were last reading about.
 */
function threeLayerFigure(): Figure {
  const maidr: Maidr = {
    id: 'layers',
    subplots: [[{
      layers: [
        { id: 'bars', type: TraceType.BAR, name: 'Observed', data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }] },
        { id: 'line', type: TraceType.LINE, name: 'Fitted', data: [[{ x: 'A', y: 3 }, { x: 'B', y: 4 }]] },
        { id: 'more', type: TraceType.LINE, name: 'Residual', data: [[{ x: 'A', y: 5 }, { x: 'B', y: 6 }]] },
      ],
    }]],
  };
  return new Figure(maidr);
}

function oneLayerFigure(): Figure {
  const maidr: Maidr = {
    id: 'one',
    subplots: [[{
      layers: [{ id: 'bars', type: TraceType.BAR, data: [{ x: 'A', y: 1 }] }],
    }]],
  };
  return new Figure(maidr);
}

function createMockDisplayService(): DisplayService {
  return { toggleFocus: jest.fn() } as unknown as DisplayService;
}

/** Builds a service over a real figure, plus the context it reads. */
function serviceOver(figure: Figure): { service: DescriptionService; context: Context } {
  const context = new Context(figure);
  return {
    service: new DescriptionService(context, createMockDisplayService()),
    context,
  };
}

/** Records everything the figure's layers announce. */
function record(figure: Figure): string[] {
  const log: string[] = [];
  figure.activeSubplot.traces.flat().forEach((trace, index) => {
    trace.addObserver({
      update: (state: TraceState | PlotState) => log.push(`trace${index}:${state.empty ? 'empty' : 'ok'}`),
    });
  });
  return log;
}

describe('the description carries its subplot layers', () => {
  test('lists every layer, marking the one it describes', () => {
    const { service, context } = serviceOver(threeLayerFigure());

    expect(service.getDescription()?.layers).toEqual([
      { index: 0, label: 'Observed', isActive: true },
      { index: 1, label: 'Fitted', isActive: false },
      { index: 2, label: 'Residual', isActive: false },
    ]);

    context.dispose();
  });

  test('omits the field entirely for a single-layer subplot', () => {
    const { service, context } = serviceOver(oneLayerFigure());

    expect(service.getDescription()).not.toHaveProperty('layers');

    context.dispose();
  });
});

describe('selecting a layer from the dialog', () => {
  test('hands back the chosen layer description and moves the reader there', () => {
    const figure = threeLayerFigure();
    const { service, context } = serviceOver(figure);

    const next = service.selectLayer(2);

    expect(next?.layers?.find(layer => layer.isActive)?.index).toBe(2);
    expect(context.active).toBe(figure.activeSubplot.traces[2][0]);

    context.dispose();
  });

  test('refuses an index that names the layer already shown, or no layer at all', () => {
    const { service, context } = serviceOver(threeLayerFigure());

    expect(service.selectLayer(0)).toBeNull();
    expect(service.selectLayer(11)).toBeNull();

    context.dispose();
  });

  test('says nothing while the modal is open', () => {
    const figure = threeLayerFigure();
    const { service, context } = serviceOver(figure);
    const log = record(figure);

    service.selectLayer(1);

    expect(log).toEqual([]);

    context.dispose();
  });

  test('speaks the layer once on the way out, however many tabs were browsed', () => {
    const figure = threeLayerFigure();
    const { service, context } = serviceOver(figure);
    service.selectLayer(1);
    service.selectLayer(2);
    const log = record(figure);

    service.announcePendingLayerSwitch();

    expect(log).toEqual(['trace2:ok']);

    context.dispose();
  });

  test('stays quiet on an ordinary open and close, where no tab was touched', () => {
    const figure = threeLayerFigure();
    const { service, context } = serviceOver(figure);
    const log = record(figure);

    service.announcePendingLayerSwitch();

    expect(log).toEqual([]);

    context.dispose();
  });

  test('does not announce the same switch twice', () => {
    const figure = threeLayerFigure();
    const { service, context } = serviceOver(figure);
    service.selectLayer(1);
    service.announcePendingLayerSwitch();
    const log = record(figure);

    service.announcePendingLayerSwitch();

    expect(log).toEqual([]);

    context.dispose();
  });

  test('drops a pending announcement on teardown rather than carrying it into the next dialog', () => {
    const figure = threeLayerFigure();
    const { service, context } = serviceOver(figure);
    service.selectLayer(1);

    service.dispose();
    const log = record(figure);
    service.announcePendingLayerSwitch();

    expect(log).toEqual([]);

    context.dispose();
  });
});
