import type { GanttTrace } from '@model/gantt';
import type { MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { afterAll, afterEach, describe, expect, jest, test } from '@jest/globals';
import { Context } from '@model/context';
import { TraceFactory } from '@model/factory';
import { Figure } from '@model/plot';
import { DiagramType, Orientation, TraceType } from '@type/grammar';
import { DEFAULT_LOCALE, setLocale } from '@util/i18n';
// The Korean dictionary is a locale pack, not part of the core, so load it.
import '../../src/locale/ko';

/**
 * A layer that names the chart type it is read as: what MAIDR says the chart
 * is wherever it names its type, in place of the trace type it borrows.
 */

// A guide the description will not show, and a diagram type MAIDR does not
// know, are said in the console, on purpose.
const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
afterAll(() => {
  warn.mockRestore();
});

/**
 * A packet diagram read as a gantt, as the Mermaid adapter reads one.
 * @param typeLabel - What the layer calls its chart type, or undefined for nothing
 * @returns The layer
 */
function packetLayer(typeLabel?: string): MaidrLayer {
  return {
    id: 'packet-layer',
    type: TraceType.GANTT,
    orientation: Orientation.HORIZONTAL,
    ...(typeLabel === undefined ? {} : { typeLabel }),
    axes: { x: { label: 'Bit' }, y: { label: 'Row' } },
    data: { points: [[{ x: 'Bits 0 to 31', start: 0, end: 15, label: 'Source port' }]], unit: 'bits', inclusive: true },
  };
}

/**
 * The instruction a reader hears on entering a chart of one layer.
 * @param layer - The layer
 * @returns The instruction, without the click prompt
 */
function instructionFor(layer: MaidrLayer): string {
  return new Context(new Figure({ id: 'type-label-test', subplots: [[{ layers: [layer] }]] })).getInstruction(false);
}

/**
 * The state of a layer's trace on its first point.
 * @param layer - The layer
 * @returns The trace state
 */
function stateOf(layer: MaidrLayer): NonEmptyTraceState {
  const trace = TraceFactory.create(layer);
  trace.moveToIndex(0, 0);
  return trace.state as NonEmptyTraceState;
}

describe('a layer that names its chart type', () => {
  test('is described as that chart, without the guide to the type it borrows', () => {
    const trace = TraceFactory.create(packetLayer('Packet Diagram')) as GanttTrace;

    expect(trace.description.chartType).toBe('Packet Diagram');
    expect(trace.layerLabel).toBe('Packet Diagram');
    expect(trace.guide).toBeUndefined();
  });

  test('is introduced as that chart on entry', () => {
    expect(stateOf(packetLayer('Packet Diagram')).plotType).toBe('Packet Diagram');
    expect(instructionFor(packetLayer('Packet Diagram'))).toContain('type: horizontal Packet Diagram.');
  });

  test('is so named by a trace that otherwise names itself', () => {
    const journey: MaidrLayer = {
      id: 'journey-layer',
      type: TraceType.LINE,
      typeLabel: 'User Journey',
      axes: { x: { label: 'Task' }, y: { label: 'Score' } },
      data: [[{ x: 'Make tea', y: 5 }, { x: 'Do work', y: 1 }]],
    };

    expect(stateOf(journey).plotType).toBe('User Journey');
    expect(instructionFor(journey)).toContain('type: User Journey.');
  });

  test('is named for its trace type when the name it gives is blank', () => {
    const trace = TraceFactory.create(packetLayer('  ')) as GanttTrace;

    expect(trace.description.chartType).toBe('Gantt Chart');
    expect(trace.guide?.definition).toContain('Gantt');
    expect(instructionFor(packetLayer('  '))).toContain('type: horizontal gantt.');
  });
});

describe('a layer that explains the chart type it names', () => {
  const GUIDE = {
    definition: '  A packet diagram shows the layout of a block of data as fields of bits.  ',
    purpose: 'It is used to document a protocol.',
    appearance: 'Each field is a box as wide as its bits.',
  };

  test('is described with its own guide in place of the trace type\'s', () => {
    const trace = TraceFactory.create({ ...packetLayer('Packet Diagram'), typeGuide: GUIDE }) as GanttTrace;

    expect(trace.guide).toEqual({
      definition: 'A packet diagram shows the layout of a block of data as fields of bits.',
      purpose: 'It is used to document a protocol.',
      appearance: 'Each field is a box as wide as its bits.',
    });
  });

  test('is described with no guide when its guide leaves a part out or blank', () => {
    const missing = { definition: GUIDE.definition, purpose: GUIDE.purpose } as typeof GUIDE;
    const blank = { ...GUIDE, appearance: '   ' };

    expect((TraceFactory.create({ ...packetLayer('Packet Diagram'), typeGuide: missing }) as GanttTrace).guide)
      .toBeUndefined();
    expect((TraceFactory.create({ ...packetLayer('Packet Diagram'), typeGuide: blank }) as GanttTrace).guide)
      .toBeUndefined();
  });

  test('keeps the trace type\'s guide when it names no chart type of its own', () => {
    const trace = TraceFactory.create({ ...packetLayer(), typeGuide: GUIDE }) as GanttTrace;

    expect(trace.description.chartType).toBe('Gantt Chart');
    expect(trace.guide?.definition).toContain('Gantt');
  });

  test('says in the console, once, why a guide it gives is not shown', () => {
    warn.mockClear();
    const unnamed = { ...packetLayer(), id: 'unnamed-guide', typeGuide: GUIDE };
    const incomplete = { ...packetLayer('Packet Diagram'), id: 'incomplete-guide', typeGuide: { ...GUIDE, purpose: '' } };

    TraceFactory.create(unnamed);
    TraceFactory.create(unnamed);
    TraceFactory.create(incomplete);
    TraceFactory.create({ ...packetLayer('Packet Diagram'), id: 'whole-guide', typeGuide: GUIDE });
    TraceFactory.create({ ...packetLayer('Packet Diagram'), id: 'no-guide' });

    expect(warn.mock.calls.map(call => String(call[0]))).toEqual([
      expect.stringContaining('Layer "unnamed-guide" (gantt): `typeGuide` is set without a `typeLabel`'),
      expect.stringContaining('Layer "incomplete-guide" (gantt): `typeGuide` needs a non-blank'),
    ]);
  });
});

describe('a layer that says which diagram it is', () => {
  afterEach(() => {
    setLocale(DEFAULT_LOCALE);
  });

  const GUIDE = {
    definition: 'A bit layout shows the fields of a block of data.',
    purpose: 'It is used to document a protocol.',
    appearance: 'Each field is a box as wide as its bits.',
  };

  test('is named and explained as that diagram, in the reader\'s language', () => {
    const layer = { ...packetLayer(), diagramType: DiagramType.PACKET };
    const trace = TraceFactory.create(layer) as GanttTrace;

    expect(trace.description.chartType).toBe('Packet Diagram');
    expect(trace.guide?.definition).toMatch(/^A packet diagram shows the layout of a network packet/);
    expect(instructionFor(layer)).toContain('type: horizontal Packet Diagram.');

    setLocale('ko');

    expect(trace.description.chartType).toBe('패킷 다이어그램');
    expect(trace.layerLabel).toBe('패킷 다이어그램');
    expect(trace.guide?.definition).toMatch(/^패킷 다이어그램은 /);
    expect(instructionFor(layer)).toContain('패킷 다이어그램');
  });

  test('is so named by a trace that otherwise names itself', () => {
    const journey: MaidrLayer = {
      id: 'journey-diagram',
      type: TraceType.LINE,
      diagramType: DiagramType.USER_JOURNEY,
      axes: { x: { label: 'Task' }, y: { label: 'Score' } },
      data: [[{ x: 'Make tea', y: 5 }, { x: 'Do work', y: 1 }]],
    };

    expect(stateOf(journey).plotType).toBe('User Journey');
  });

  test('wins over the name and guide it writes out, which are for a MAIDR that does not know it', () => {
    warn.mockClear();
    const layer = { ...packetLayer('Bit Layout'), id: 'both', typeGuide: GUIDE, diagramType: DiagramType.PACKET };
    const trace = TraceFactory.create(layer) as GanttTrace;

    expect(trace.description.chartType).toBe('Packet Diagram');
    expect(trace.guide?.definition).toMatch(/^A packet diagram /);
    expect(warn).not.toHaveBeenCalled();
  });

  test('explains each level of a C4 diagram as a C4 diagram', () => {
    const context = TraceFactory.create({ ...packetLayer(), diagramType: DiagramType.C4_CONTEXT }) as GanttTrace;
    const plain = TraceFactory.create({ ...packetLayer(), diagramType: DiagramType.C4 }) as GanttTrace;

    expect(context.description.chartType).toBe('C4 Context Diagram');
    expect(context.guide).toEqual(plain.guide);
  });

  test('is named as it writes itself out, or as its layer type, when MAIDR does not know the diagram, and says so once', () => {
    warn.mockClear();
    const written = { ...packetLayer('Bit Layout'), id: 'unknown-written', diagramType: 'bit_layout' as DiagramType };
    const bare = { ...packetLayer(), id: 'unknown-bare', diagramType: ' Packet ' as DiagramType };

    const named = TraceFactory.create(written) as GanttTrace;
    TraceFactory.create(written);
    const unnamed = TraceFactory.create(bare) as GanttTrace;

    expect(named.description.chartType).toBe('Bit Layout');
    expect(unnamed.description.chartType).toBe('Gantt Chart');
    expect(unnamed.guide?.definition).toContain('Gantt');
    expect(warn.mock.calls.map(call => String(call[0]))).toEqual([
      expect.stringContaining('Layer "unknown-written" (gantt): `diagramType` "bit_layout" is not a diagram type this MAIDR knows'),
      expect.stringContaining('Layer "unknown-bare" (gantt): `diagramType` " Packet " is not a diagram type this MAIDR knows'),
    ]);
  });
});
