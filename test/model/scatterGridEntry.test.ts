import type { MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

/**
 * Where grid navigation starts.
 *
 * Mermaid's quadrant chart: four campaigns on axes cut into quadrants. From
 * Campaign C, in the top right, the rotor's grid navigation started in the
 * bottom-left cell, with C still outlined, so the first arrow moved from a
 * cell the reader had never been told they were in.
 */
function quadrant(): MaidrLayer {
  return {
    id: 'campaigns',
    type: TraceType.SCATTER,
    axes: {
      x: { label: 'Reach', min: 0, max: 1, tickStep: 0.5 },
      y: { label: 'Engagement', min: 0, max: 1, tickStep: 0.5 },
    },
    data: [
      { x: 0.3, y: 0.6, label: 'Campaign A' },
      { x: 0.45, y: 0.23, label: 'Campaign B' },
      { x: 0.57, y: 0.69, label: 'Campaign C' },
      { x: 0.78, y: 0.34, label: 'Campaign D' },
    ],
  };
}

/** A quadrant chart with the reader on Campaign C, the third column. */
function onCampaignC(): ScatterTrace {
  const trace = new ScatterTrace(quadrant());
  trace.moveOnce('FORWARD');
  trace.moveOnce('FORWARD');
  trace.moveOnce('FORWARD');
  return trace;
}

describe('entering grid navigation', () => {
  test('starts in the cell of the point the reader is on', () => {
    const trace = onCampaignC();

    trace.setGridMode(true);

    expect(trace.getGridPosition()).toEqual({ row: 2, col: 2 });
  });

  test('so the first arrow moves from that cell', () => {
    const trace = onCampaignC();
    trace.setGridMode(true);

    expect(trace.moveGridDown()).toBe(true);

    expect(trace.getGridPosition()).toEqual({ row: 1, col: 2 });
  });

  test('from a row, starts in the cell of the row\'s point', () => {
    const trace = new ScatterTrace(quadrant());
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD'); // Campaign A's row.
    trace.moveOnce('DOWNWARD'); // Campaign D's row: (0.78, 0.34).

    trace.setGridMode(true);

    expect(trace.getGridPosition()).toEqual({ row: 1, col: 2 });
  });

  test('starts in the bottom-left cell before the reader has entered the data', () => {
    const trace = new ScatterTrace(quadrant());

    trace.setGridMode(true);

    expect(trace.getGridPosition()).toEqual({ row: 1, col: 1 });
  });

  test('starts in the bottom-left cell when the point lies outside the grid', () => {
    const layer = quadrant();
    layer.data = [{ x: 0.2, y: 0.2 }, { x: 1.5, y: 0.8 }];
    const trace = new ScatterTrace(layer);
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD'); // (1.5, 0.8), right of the last cell.

    trace.setGridMode(true);

    expect(trace.getGridPosition()).toEqual({ row: 1, col: 1 });
  });
});
