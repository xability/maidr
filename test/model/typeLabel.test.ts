import type { GanttTrace } from '@model/gantt';
import type { MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { Context } from '@model/context';
import { TraceFactory } from '@model/factory';
import { Figure } from '@model/plot';
import { Orientation, TraceType } from '@type/grammar';

/**
 * A layer that names the chart type it is read as: what MAIDR says the chart
 * is wherever it names its type, in place of the trace type it borrows.
 */

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
