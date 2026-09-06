import type { Maidr } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';

/**
 * The instruction for a multi-layer subplot names the layer the reader is on.
 * It is rebuilt whenever the display re-attaches it -- after a live update,
 * for instance -- so the layer number has to follow the active layer rather
 * than always claiming the first.
 */
function twoLayerMaidr(): Maidr {
  return {
    id: 'layers',
    subplots: [[{
      layers: [
        { id: 'bars', type: TraceType.BAR, data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }] },
        { id: 'line', type: TraceType.LINE, data: [[{ x: 'A', y: 3 }, { x: 'B', y: 4 }]] },
      ],
    }]],
  };
}

describe('the layer instruction', () => {
  test('names the first layer on entry', () => {
    const context = new Context(new Figure(twoLayerMaidr()));

    const instruction = context.getInstruction(false);

    expect(instruction).toMatch(/layer 1 of 2: [a-z ]*bar plot/);
  });

  test('names the layer the reader has switched to', () => {
    const context = new Context(new Figure(twoLayerMaidr()));
    context.moveOnce('FORWARD');

    context.stepTrace('UPWARD');
    const instruction = context.getInstruction(false);

    expect(instruction).toMatch(/layer 2 of 2: [a-z ]*line plot/);
    expect(instruction).not.toContain('layer 1 of 2');
  });
});
