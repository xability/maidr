import type { BoxPoint, Maidr, MaidrLayer } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { Orientation, TraceType } from '@type/grammar';

jest.mock('hotkeys-js', () => ({
  __esModule: true,
  default: { setScope: jest.fn() },
}));

/**
 * Creates a bar layer, optionally declaring an orientation.
 * @param orientation - The orientation to declare, or undefined to omit it
 * @returns A bar layer definition
 */
function createBarLayer(orientation?: Orientation): MaidrLayer {
  return {
    id: 'bar-layer',
    type: TraceType.BAR,
    axes: { x: { label: 'Category' }, y: { label: 'Value' } },
    orientation,
    data: [
      { x: 'A', y: 1 },
      { x: 'B', y: 2 },
    ],
  };
}

/**
 * Creates a box layer, optionally declaring an orientation.
 * @param orientation - The orientation to declare, or undefined to omit it
 * @returns A box layer definition
 */
function createBoxLayer(orientation?: Orientation): MaidrLayer {
  const point: BoxPoint = {
    z: 'A',
    lowerOutliers: [],
    min: 1,
    q1: 2,
    q2: 3,
    q3: 4,
    max: 5,
    upperOutliers: [],
  };
  return {
    id: 'box-layer',
    type: TraceType.BOX,
    axes: { x: { label: 'Category' }, y: { label: 'Value' } },
    orientation,
    data: [point],
  };
}

/**
 * Creates a single-group line layer, which has no orientation.
 * @returns A line layer definition
 */
function createLineLayer(): MaidrLayer {
  return {
    id: 'line-layer',
    type: TraceType.LINE,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data: [[{ x: 1, y: 1 }, { x: 2, y: 2 }]],
  };
}

/**
 * Wraps layers into a single-subplot Maidr config.
 * @param layers - The layers of the only subplot
 * @returns A Maidr config
 */
function createMaidr(...layers: MaidrLayer[]): Maidr {
  return { id: 'instruction-test', subplots: [[{ layers }]] };
}

/**
 * Builds the instruction a user hears on entering the figure.
 * @param layers - The layers of the only subplot
 * @returns The instruction text, without the click prompt
 */
function instructionFor(...layers: MaidrLayer[]): string {
  return new Context(new Figure(createMaidr(...layers))).getInstruction(false);
}

describe('context.getInstruction orientation', () => {
  test('announces an undeclared bar orientation as vertical', () => {
    expect(instructionFor(createBarLayer())).toContain('type: vertical bar.');
  });

  test('announces a declared horizontal bar orientation', () => {
    expect(instructionFor(createBarLayer(Orientation.HORIZONTAL))).toContain(
      'type: horizontal bar.',
    );
  });

  test('announces an undeclared box orientation as vertical', () => {
    expect(instructionFor(createBoxLayer())).toContain('type: vertical box.');
  });

  test('announces a declared horizontal box orientation', () => {
    expect(instructionFor(createBoxLayer(Orientation.HORIZONTAL))).toContain(
      'type: horizontal box.',
    );
  });

  test('leaves a trace type that has no orientation unprefixed', () => {
    expect(instructionFor(createLineLayer())).toContain('type: single line.');
  });

  test('announces the orientation of layer 1 of a multi-layer plot', () => {
    expect(instructionFor(createBarLayer(), createLineLayer())).toContain(
      'layer 1 of 2: vertical bar plot.',
    );
  });
});
