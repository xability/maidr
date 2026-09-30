/**
 * `onNavigate(null)` is the cursor leaving a subplot for the figure lobby:
 * nothing is selected any more. Clearing only the DOM overlay left Chart.js's
 * own active element and tooltip painted on the point the reader had left.
 */

import type { ChartJsActiveElement, ChartJsChart } from '@adapters/chartjs/types';
import type { MaidrLayer } from '@type/grammar';
import { computeTargetMaps } from '@adapters/chartjs/highlightTargets';
import { createHighlightCallback } from '@adapters/chartjs/plugin';
import { describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';

const LAYER: MaidrLayer = {
  id: '0',
  type: TraceType.BAR,
  data: [{ x: 'a', y: 1 }, { x: 'b', y: 2 }],
};

function fakeChart(): {
  chart: ChartJsChart;
  active: jest.Mock<(elements: ChartJsActiveElement[]) => void>;
  tooltipActive: jest.Mock<(elements: ChartJsActiveElement[], position: { x: number; y: number }) => void>;
} {
  const active = jest.fn<(elements: ChartJsActiveElement[]) => void>();
  const tooltipActive = jest.fn<(elements: ChartJsActiveElement[], position: { x: number; y: number }) => void>();
  const chart = {
    data: { labels: ['a', 'b'], datasets: [{ data: [1, 2] }] },
    options: {},
    getDatasetMeta: () => ({ data: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }),
    setActiveElements: active,
    tooltip: { setActiveElements: tooltipActive },
    update: () => {},
  } as unknown as ChartJsChart;
  return { chart, active, tooltipActive };
}

describe('the Chart.js highlight callback', () => {
  it('resets the native active element and tooltip when nothing is selected', () => {
    const { chart, active, tooltipActive } = fakeChart();
    const indices = new Map([['0', [0]]]);
    const onNavigate = createHighlightCallback(
      chart,
      [LAYER],
      computeTargetMaps(chart, [LAYER], indices),
      indices,
      () => null,
      () => {},
    );

    onNavigate({ layerId: '0', row: 0, col: 1 } as Parameters<typeof onNavigate>[0]);
    expect(active).toHaveBeenLastCalledWith([expect.objectContaining({ datasetIndex: 0 })]);

    onNavigate(null);

    expect(active).toHaveBeenLastCalledWith([]);
    expect(tooltipActive).toHaveBeenLastCalledWith([], expect.anything());
  });
});
