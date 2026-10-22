import type { MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
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

/** A second layer, of bars that name no campaign, for a switch to miss. */
function budget(): MaidrLayer {
  return {
    id: 'budget',
    type: TraceType.BAR,
    axes: { x: { label: 'Quarter' }, y: { label: 'Budget' } },
    data: [{ x: 'Q1', y: 3 }, { x: 'Q2', y: 5 }],
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

/**
 * Turns the rotor from point to grid navigation as the rotor service does:
 * it leaves every mode before it enters the new one, so the trace is out of
 * point navigation by the time it is asked into the grid.
 */
function leavePointForGrid(trace: ScatterTrace): void {
  trace.setGridMode(false);
  trace.setPointMode(false);
  trace.setIntersectionMode(false);
  trace.setGridMode(true);
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

  test('from point navigation, starts in the cell of the point the reader reached', () => {
    const trace = new ScatterTrace(quadrant());
    trace.moveOnce('FORWARD'); // Campaign A's column, top left.
    trace.setPointMode(true); // On Campaign A.
    trace.movePointRight(); // Campaign D, bottom right.

    leavePointForGrid(trace);

    expect(trace.getGridPosition()).toEqual({ row: 1, col: 2 });
  });

  test('from point navigation, the first arrow moves from that point\'s cell', () => {
    const trace = new ScatterTrace(quadrant());
    trace.moveOnce('FORWARD');
    trace.setPointMode(true);
    trace.movePointRight(); // Campaign D, bottom right.
    leavePointForGrid(trace);

    expect(trace.moveGridUp()).toBe(true);

    expect(trace.getGridPosition()).toEqual({ row: 2, col: 2 });
  });

  test('after a move in row and column navigation, starts from where that move went', () => {
    const trace = new ScatterTrace(quadrant());
    trace.moveOnce('FORWARD'); // Campaign A's column.
    trace.setPointMode(true);
    trace.movePointRight(); // Campaign D.
    trace.setPointMode(false); // The rotor turned back to row and column navigation.
    trace.moveOnce('FORWARD'); // Campaign B's column.
    trace.moveOnce('FORWARD'); // Campaign C's column, top right.

    trace.setGridMode(true);

    expect(trace.getGridPosition()).toEqual({ row: 2, col: 2 });
  });

  test('after a layer switch back that says where the reader is, starts from there', () => {
    const subplot = new Figure({ id: 'chart', subplots: [[{ layers: [quadrant(), budget()] }]] })
      .activeSubplot;
    const campaigns = subplot.activeTrace as ScatterTrace;
    campaigns.moveOnce('FORWARD'); // Campaign A's column.
    campaigns.setPointMode(true);
    campaigns.movePointRight(); // Campaign D.
    campaigns.setPointMode(false); // A layer switch turns the rotor back first.
    subplot.switchLayer('UPWARD'); // The budget, which names no campaign.
    subplot.switchLayer('DOWNWARD'); // Back, announced at Campaign A's column.

    campaigns.setGridMode(true);

    expect(campaigns.getGridPosition()).toEqual({ row: 2, col: 1 });
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
