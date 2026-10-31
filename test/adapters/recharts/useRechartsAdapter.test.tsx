/**
 * @jest-environment jsdom
 *
 * `useRechartsAdapter` destructures its config field by field and rebuilds a
 * fresh object for the converter, so a field missing from that list is
 * discarded without a warning — the same defect `buildPanelSubplot` was fixed
 * for once already (#1017). The two documented entry points then disagree:
 * `<MaidrRecharts stepDirection="hv">` announces the riser convention and the
 * hook does not.
 */

import type { RechartsAdapterConfig } from '@adapters/recharts/types';
import type { MaidrLayer } from '@type/grammar';
import { useRechartsAdapter } from '@adapters/recharts/useRechartsAdapter';
import { describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import { Orientation, TraceType } from '@type/grammar';

/** Defined once, as the hook asks of the arrays it compares by reference. */
const LINE_KEYS = ['v', 'w'];
const LINE_ROWS = [
  { t: 1, v: 10, w: 5 },
  { t: 2, v: 20, w: 15 },
];

const SAMPLES = [
  { t: 1, v: 10 },
  { t: 2, v: 20 },
];

/** The hook's first layer, for one config. */
function layerFor(config: RechartsAdapterConfig): MaidrLayer {
  const { result } = renderHook(() => useRechartsAdapter(config));
  return result.current.subplots[0][0].layers[0];
}

describe('useRechartsAdapter', () => {
  it('forwards the riser convention a step chart declared', () => {
    // Without it `StepTrace` announces no convention, so the reader is never
    // told whether the value they hear covers the interval before or after
    // the time — the regression #1059 was filed for.
    const layer = layerFor({
      id: 's',
      data: SAMPLES,
      chartType: 'step',
      xKey: 't',
      yKeys: ['v'],
      stepDirection: 'hv',
    });

    expect(layer.type).toBe(TraceType.STEP);
    expect(layer.stepDirection).toBe('hv');
  });

  it('forwards a reversed category axis, so the walk runs the way the chart draws', () => {
    const layer = layerFor({
      id: 'r',
      data: [{ q: 'Q1', v: 10 }, { q: 'Q2', v: 20 }],
      chartType: 'bar',
      xKey: 'q',
      yKeys: ['v'],
      categoryAxisReversed: true,
    });

    expect(layer.data).toEqual([{ x: 'Q2', y: 20 }, { x: 'Q1', y: 10 }]);
  });

  it('forwards a per-panel reversed axis in subplot mode', () => {
    const { result } = renderHook(() => useRechartsAdapter({
      id: 'g',
      xKey: 'q',
      subplots: [[
        { chartType: 'bar', xKey: 'q', yKeys: ['v'], data: [{ q: 'Q1', v: 10 }, { q: 'Q2', v: 20 }] },
      ]],
      categoryAxisReversedPerPanel: [true],
    } as RechartsAdapterConfig));

    const layer = result.current.subplots[0][0].layers[0];

    expect(layer.data).toEqual([{ x: 'Q2', y: 20 }, { x: 'Q1', y: 10 }]);
  });

  it('hands back the same data on the next render when the dot-drawing series are written inline', () => {
    // A new MAIDR object is a data change to `<Maidr>`, which forgets the
    // point a reader who stepped away would come back to.
    const { result, rerender } = renderHook(() => useRechartsAdapter({
      id: 'inline-dots',
      data: LINE_ROWS,
      chartType: 'line',
      xKey: 't',
      yKeys: LINE_KEYS,
      dotSeries: ['v', 'w'],
    }));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it('says once that a ridgeline given without its drawn key is read in first-appearance order', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const ridges = [
      { month: 'Jan', temp: 0, density: 0.1, plotted: 1.1 },
      { month: 'Feb', temp: 0, density: 0.3, plotted: 0.3 },
    ];
    try {
      const { rerender } = renderHook(() => useRechartsAdapter({
        id: 'hook-ridges',
        data: ridges,
        chartType: 'ridgeline',
        xKey: 'temp',
        ridgelineConfig: { groupKey: 'month', valueKey: 'temp', densityKey: 'density' },
      }));
      rerender();
      renderHook(() => useRechartsAdapter({
        id: 'hook-ridges-keyed',
        data: ridges,
        chartType: 'ridgeline',
        xKey: 'temp',
        ridgelineConfig: { groupKey: 'month', valueKey: 'temp', densityKey: 'density', plottedKey: 'plotted' },
      }));

      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('Ridgeline "hook-ridges"');
    } finally {
      warn.mockRestore();
    }
  });

  it('forwards where a bump chart draws first place', () => {
    const layer = layerFor({
      id: 'k',
      data: [{ round: 1, ash: 1, birch: 2 }, { round: 2, ash: 2, birch: 1 }],
      chartType: 'bump',
      xKey: 'round',
      yKeys: ['ash', 'birch'],
      firstPlace: 'top',
    });

    expect(layer.type).toBe(TraceType.BUMP);
    expect(layer.firstPlace).toBe('top');
  });

  it('keeps forwarding the fields it already did', () => {
    const layer = layerFor({
      id: 'b',
      data: [{ band: '0-9', people: 5 }],
      chartType: 'bar',
      xKey: 'band',
      yKeys: ['people'],
      xLabel: 'Band',
      yLabel: 'People',
      orientation: Orientation.HORIZONTAL,
    });

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.axes).toEqual({ x: { label: 'People' }, y: { label: 'Band' } });
  });
});
