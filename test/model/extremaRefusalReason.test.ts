import type { AbstractTrace } from '@model/abstract';
import type { ScatterTrace } from '@model/scatter';
import type { Maidr, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Context } from '@model/context';
import { TraceFactory } from '@model/factory';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';

/** A two-step flowchart: its nodes are named and linked, never measured. */
const FLOWCHART: MaidrLayer = {
  id: 'flow',
  type: TraceType.DIRECTED_GRAPH,
  title: 'Pipeline',
  axes: { x: { label: 'Step' } },
  data: [{ id: 'load' }, { id: 'clean', inputs: ['load'] }],
};

/** One message between two lifelines. */
const SEQUENCE: MaidrLayer = {
  id: 'seq',
  type: TraceType.SEQUENCE,
  title: 'Login',
  data: {
    participants: [{ id: 'B', label: 'Browser' }, { id: 'S', label: 'Server' }],
    messages: [{ from: 'B', to: 'S', text: 'POST /login' }],
  },
};

/** One measure on a dial. */
const GAUGE: MaidrLayer = {
  id: 'gauge',
  type: TraceType.GAUGE,
  title: 'Conversion rate',
  axes: { x: { label: 'Measure' }, y: { label: 'Percent' } },
  data: { label: 'Conversion', value: 73, min: 0, max: 100 },
};

/** An org chart: a tree whose nodes are named and nested, never measured. */
const ORG_CHART: MaidrLayer = {
  id: 'org',
  type: TraceType.TREEMAP,
  data: [
    { x: 'CEO' },
    { x: 'CTO', path: ['CEO'] },
    { x: 'CFO', path: ['CEO'] },
  ],
};

/** Two sets drawn for who is in them, with no sizes. */
const VENN: MaidrLayer = {
  id: 'venn',
  type: TraceType.VENN,
  data: [
    { sets: ['A'], items: ['x', 'y'] },
    { sets: ['B'], items: ['z'] },
    { sets: ['A', 'B'], items: ['y'] },
  ],
};

/** Points on a grid of four cells, two of them sharing an x. */
const POINTS: MaidrLayer = {
  id: 'points',
  type: TraceType.SCATTER,
  axes: {
    x: { label: 'X', min: 0, max: 2, tickStep: 1 },
    y: { label: 'Y', min: 0, max: 2, tickStep: 1 },
  },
  data: [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 1.5 }, { x: 1.5, y: 1 }],
};

/** Two classifiers' ROC curves, each from (0, 0) to (1, 1). */
const ROC: MaidrLayer = {
  id: 'roc',
  type: TraceType.ROC,
  axes: { x: { label: 'False positive rate' }, y: { label: 'True positive rate' } },
  data: [
    [{ x: 0, y: 0, z: 'Logistic' }, { x: 0.1, y: 0.75, z: 'Logistic' }, { x: 1, y: 1, z: 'Logistic' }],
    [{ x: 0, y: 0, z: 'Forest' }, { x: 0.25, y: 0.6, z: 'Forest' }, { x: 1, y: 1, z: 'Forest' }],
  ],
};

/** One precision-recall curve, its loosest threshold at a precision of 0.3. */
const PR_CURVE: MaidrLayer = {
  id: 'pr',
  type: TraceType.PR_CURVE,
  axes: { x: { label: 'Recall' }, y: { label: 'Precision' } },
  data: [[{ x: 0, y: 1 }, { x: 0.8, y: 0.7 }, { x: 1, y: 0.3 }]],
};

/** Two bars, whose taller one `]` goes to. */
const BARS: MaidrLayer = {
  id: 'bars',
  type: TraceType.BAR,
  axes: { x: { label: 'Fruit' }, y: { label: 'Count' } },
  data: [{ x: 'Apple', y: 1 }, { x: 'Pear', y: 2 }],
};

/**
 * A trace, as the figure builds one.
 * @param layer The layer
 * @returns The trace
 */
function traceOf(layer: MaidrLayer): AbstractTrace {
  return TraceFactory.create(layer) as AbstractTrace;
}

/**
 * A figure of one panel per layer.
 * @param layers The layers, one panel each
 * @returns The MAIDR payload
 */
function figureOf(...layers: MaidrLayer[]): Maidr {
  return { id: 'reasons', subplots: layers.map(layer => [{ layers: [layer] }]) };
}

describe('a layer with no extremum by design says why', () => {
  test.each([
    ['a flowchart', FLOWCHART, 'its nodes carry no values'],
    ['a sequence diagram', SEQUENCE, 'its messages carry no values'],
    ['a gauge', GAUGE, 'a gauge shows one value'],
  ])('%s', (_name, layer, reason) => {
    const trace = traceOf(layer);

    expect(trace.supportsExtremaNavigation()).toBe(false);
    expect(trace.noExtremaReason()).toBe(reason);
  });

  test('a tree drawn without values', () => {
    expect(traceOf(ORG_CHART).noExtremaReason()).toBe('its nodes carry no values');
  });

  test('a Venn diagram drawn without sizes', () => {
    expect(traceOf(VENN).noExtremaReason()).toBe('its regions carry no sizes');
  });

  test('a scatter plot in grid navigation, which moves between cells', () => {
    const trace = traceOf(POINTS) as ScatterTrace;

    trace.setGridMode(true);

    expect(trace.noExtremaReason()).toBe('grid navigation moves between cells, not points');
  });

  test('a scatter plot in intersecting point navigation, which stays at one x or y', () => {
    const trace = traceOf(POINTS) as ScatterTrace;

    trace.setIntersectionMode(true);

    expect(trace.noExtremaReason())
      .toBe('intersecting point navigation moves only among points at the same x or y');
  });

  test('a scatter plot gives none walking its columns and rows', () => {
    // Those modes have points to go to, so a refusal there is not by design.
    const trace = traceOf(POINTS) as ScatterTrace;

    expect(trace.noExtremaReason()).toBeNull();
  });

  test('a layer with extrema gives no reason', () => {
    const trace = traceOf(BARS);

    expect(trace.supportsExtremaNavigation()).toBe(true);
    expect(trace.noExtremaReason()).toBeNull();
  });

  test('the context reads the reason from the layer the cursor is in', () => {
    const context = new Context(new Figure(figureOf(GAUGE)));

    expect(context.noExtremaReason()).toBe('a gauge shows one value');
  });

  test.each([
    ['a ROC curve', ROC],
    ['a precision-recall curve', PR_CURVE],
  ])('%s says why [ has nothing to go to, and gives ] and G no reason', (_name, layer) => {
    // `[` said only that there was no minimum value, as on a layer whose
    // data happened to hold none. `]` and `G` go to the best point.
    const trace = traceOf(layer);

    expect(trace.noExtremaReason('min')).toBe('its lowest point is an end every curve shares');
    expect(trace.noExtremaReason('max')).toBeNull();
    expect(trace.noExtremaReason()).toBeNull();
  });

  test('the context passes on which extreme a bracket key asks for', () => {
    const context = new Context(new Figure(figureOf(ROC)));

    expect(context.noExtremaReason('min')).toBe('its lowest point is an end every curve shares');
    expect(context.noExtremaReason('max')).toBeNull();
    expect(context.noExtremaReason()).toBeNull();
  });

  test('the context gives none above the layers, where no layer is active', () => {
    // The lobby of a two-panel figure: `[` there is refused for want of a
    // layer, not for anything a layer lacks.
    const context = new Context(new Figure(figureOf(GAUGE, FLOWCHART)));

    expect(context.activeLevel).toBe('figure');
    expect(context.noExtremaReason()).toBeNull();
  });
});
