import type { Subplot, Trace } from '@model/plot';
import type { MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Page Up and Page Down between layers drawn along different x axes.
 *
 * Highcharts' bell curve demo draws the measurements as points, observation
 * number along the bottom axis and sepal length up the left, and the normal
 * curve fitted to them along the top and right axes: sepal length across,
 * density up. A switch moved to the nearest x of the other layer, so from the
 * curve at 2.48 cm the reader landed on observation 2, and from observation 3
 * back on the curve at 3.06 cm -- numbers that only look alike.
 */

const CURVE: MaidrLayer = {
  id: 'curve',
  type: TraceType.SMOOTH,
  title: 'Bell curve',
  axes: { x: { label: 'Sepal length (cm)' }, y: { label: 'Density' } },
  data: [[
    { x: 2.359, y: 0.013 },
    { x: 2.475, y: 0.033 },
    { x: 2.591, y: 0.075 },
    { x: 3.056, y: 0.69 },
  ]],
};

const MEASUREMENTS: MaidrLayer = {
  id: 'measurements',
  type: TraceType.SCATTER,
  title: 'Measurements',
  axes: { x: { label: 'Observation' }, y: { label: 'Sepal length (cm)' } },
  data: [
    { x: 0, y: 3.5 },
    { x: 1, y: 3 },
    { x: 2, y: 3.2 },
    { x: 3, y: 3.1 },
  ],
};

/**
 * The x the trace is on.
 * @param trace - A layer of the chart
 * @returns Its current x
 */
function xOf(trace: Trace | null): unknown {
  return trace?.getCurrentXValue();
}

/**
 * The one subplot of a chart of the given layers.
 * @param layers - Its layers, the first one active
 * @returns The subplot
 */
function subplotOf(...layers: MaidrLayer[]): Subplot {
  return new Figure({ id: 'chart', subplots: [[{ layers }]] }).activeSubplot;
}

describe('a layer switch between layers on different x axes', () => {
  test('enters the other layer at its first point, not at the nearest x', () => {
    const subplot = subplotOf(CURVE, MEASUREMENTS);
    subplot.activeTrace?.moveOnce('FORWARD');
    subplot.activeTrace?.moveOnce('FORWARD');
    expect(xOf(subplot.activeTrace)).toBe(2.475);

    const points = subplot.switchLayer('UPWARD');

    expect(xOf(points)).toBe(0);
    expect(points?.isInitialEntry).toBe(false);
  });

  test('comes back to where the reader was on the curve', () => {
    const subplot = subplotOf(CURVE, MEASUREMENTS);
    subplot.activeTrace?.moveOnce('FORWARD');
    subplot.activeTrace?.moveOnce('FORWARD');
    const points = subplot.switchLayer('UPWARD');
    points?.moveOnce('FORWARD');
    points?.moveOnce('FORWARD');
    points?.moveOnce('FORWARD');
    expect(xOf(points)).toBe(3);

    const curve = subplot.switchLayer('DOWNWARD');

    expect(xOf(curve)).toBe(2.475);
  });

  test('and the dialog\'s layer tabs keep the same places', () => {
    const subplot = subplotOf(CURVE, MEASUREMENTS);
    subplot.activeTrace?.moveOnce('FORWARD');
    subplot.activeTrace?.moveOnce('FORWARD');

    expect(xOf(subplot.selectLayer(1))).toBe(0);
  });
});

describe('a layer switch between layers on one x axis', () => {
  test('still goes to the nearest x', () => {
    const sameAxis: MaidrLayer = {
      ...MEASUREMENTS,
      axes: { x: { label: 'Sepal length (cm)' }, y: { label: 'Sepal width (cm)' } },
      data: [{ x: 2.3, y: 3.5 }, { x: 2.5, y: 3 }, { x: 3.1, y: 3.2 }],
    };
    const subplot = subplotOf(CURVE, sameAxis);
    subplot.activeTrace?.moveOnce('FORWARD');
    subplot.activeTrace?.moveOnce('FORWARD');

    expect(xOf(subplot.switchLayer('UPWARD'))).toBe(2.5);
  });

  test('still goes to the nearest x where one layer names no x axis', () => {
    const unnamed: MaidrLayer = { ...MEASUREMENTS, axes: { y: { label: 'Sepal length (cm)' } } };
    const subplot = subplotOf(CURVE, unnamed);
    subplot.activeTrace?.moveOnce('FORWARD');
    subplot.activeTrace?.moveOnce('FORWARD');

    expect(xOf(subplot.switchLayer('UPWARD'))).toBe(2);
  });

  test('still goes to the nearest x where the labels differ only in case and spacing', () => {
    // The same name to a listener, and so the same axis.
    const sameName: MaidrLayer = {
      ...MEASUREMENTS,
      axes: { x: { label: '  sepal  Length (CM) ' }, y: { label: 'Sepal width (cm)' } },
      data: [{ x: 2.3, y: 3.5 }, { x: 2.5, y: 3 }, { x: 3.1, y: 3.2 }],
    };
    const subplot = subplotOf(CURVE, sameName);
    subplot.activeTrace?.moveOnce('FORWARD');
    subplot.activeTrace?.moveOnce('FORWARD');

    expect(xOf(subplot.switchLayer('UPWARD'))).toBe(2.5);
  });
});

describe('a layer switch between layers that name what they draw', () => {
  test('keeps the reader on the same thing whatever the axes', () => {
    // A Wardley map places its components by evolution and visibility and
    // draws their value chain as a graph of the same components; Mermaid
    // labels the two x axes "Evolution" and "Component".
    const map: MaidrLayer = {
      id: 'map',
      type: TraceType.SCATTER,
      axes: { x: { label: 'Evolution' }, y: { label: 'Visibility' } },
      data: [
        { x: 0.35, y: 0.43, label: 'Kettle' },
        { x: 0.61, y: 0.79, label: 'Cup of Tea' },
        { x: 0.81, y: 0.63, label: 'Tea' },
      ],
    };
    const chain: MaidrLayer = {
      id: 'chain',
      type: TraceType.DIRECTED_GRAPH,
      axes: { x: { label: 'Component' } },
      data: [
        { id: 'cup', label: 'Cup of Tea' },
        { id: 'tea', label: 'Tea', inputs: ['cup'] },
        { id: 'kettle', label: 'Kettle', inputs: ['cup'] },
      ],
    };
    const subplot = subplotOf(map, chain);
    subplot.activeTrace?.moveOnce('FORWARD'); // Kettle.
    subplot.activeTrace?.moveOnce('FORWARD'); // Cup of Tea.

    const graph = subplot.switchLayer('UPWARD');

    expect(xOf(graph)).toBe('Cup of Tea');
  });

  test('carries a category whatever the axes are called', () => {
    // A category names a bar, not a place on an axis.
    const bars: MaidrLayer = {
      id: 'bars',
      type: TraceType.BAR,
      axes: { x: { label: 'Month' }, y: { label: 'Sales' } },
      data: [{ x: 'Jan', y: 3 }, { x: 'Feb', y: 5 }, { x: 'Mar', y: 4 }],
    };
    const target: MaidrLayer = {
      id: 'target',
      type: TraceType.LINE,
      axes: { x: { label: 'Period' }, y: { label: 'Target' } },
      data: [[{ x: 'Jan', y: 4 }, { x: 'Feb', y: 4 }, { x: 'Mar', y: 4 }]],
    };
    const subplot = subplotOf(bars, target);
    subplot.activeTrace?.moveOnce('FORWARD');
    subplot.activeTrace?.moveOnce('FORWARD');

    expect(xOf(subplot.switchLayer('UPWARD'))).toBe('Feb');
  });
});

describe('the x axis a layer switch finds a layer along', () => {
  test('is the label the layer authored, trimmed', () => {
    const subplot = subplotOf({ ...CURVE, axes: { x: { label: ' Sepal length (cm) ' } } });

    expect(subplot.activeTrace?.xAxisLabel).toBe('Sepal length (cm)');
  });

  test('is none for a horizontal bar, which a switch finds by magnitude or by category', () => {
    const subplot = subplotOf({
      id: 'bars',
      type: TraceType.BAR,
      orientation: Orientation.HORIZONTAL,
      axes: { x: { label: 'Sales' }, y: { label: 'Month' } },
      data: [{ x: 3, y: 'Jan' }, { x: 5, y: 'Feb' }],
    });

    expect(subplot.activeTrace?.xAxisLabel).toBe('');
  });
});
