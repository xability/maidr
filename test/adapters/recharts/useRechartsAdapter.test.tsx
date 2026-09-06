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
import { describe, expect, it } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import { Orientation, TraceType } from '@type/grammar';

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
