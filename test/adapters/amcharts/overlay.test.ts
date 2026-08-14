import type { NavTarget } from '@adapters/amcharts/navmap';
import type { AmDataItem, AmSprite, AmXYSeries } from '@adapters/amcharts/types';
import { dataItemToOverlayRect } from '@adapters/amcharts/overlay';
import { describe, expect, it } from '@jest/globals';

/**
 * A `Slice` as amCharts reports one: a degenerate box at its own centre and
 * zero width/height, with the wedge's real extent only in its settings (#774).
 */
function wedgeSprite(cx: number, cy: number, settings: Record<string, unknown>): AmSprite {
  return {
    globalBounds: () => ({ left: cx, top: cy, right: cx, bottom: cy }),
    width: () => 0,
    height: () => 0,
    get: (key: string) => settings[key],
  };
}

/**
 * A funnel stage's graphic: no radius to measure, but a laid-out box of its
 * own, which is what a `FunnelSlice` actually carries.
 */
function stageSprite(left: number, top: number, width: number, height: number): AmSprite {
  return {
    width: () => width,
    height: () => height,
    toGlobal: point => ({ x: left + point.x, y: top + point.y }),
    get: () => undefined,
  };
}

function target(properties: Record<string, unknown>): NavTarget {
  const dataItem = { get: (key: string) => properties[key] } as unknown as AmDataItem;
  return { series: {} as AmXYSeries, dataItem, kind: 'slice' };
}

describe('dataItemToOverlayRect (wedge-shaped marks)', () => {
  it('measures a pie wedge from its settings, which is where its extent lives', () => {
    // -90 is 12 o'clock and angles run clockwise: the top-right quarter.
    const slice = wedgeSprite(100, 100, { radius: 50, startAngle: -90, arc: 90 });

    expect(dataItemToOverlayRect(target({ slice }), null))
      .toEqual({ left: 100, top: 50, width: 50, height: 50 });
  });

  it('measures a polar column, which the series keeps on `graphics`', () => {
    const slice = wedgeSprite(0, 0, { radius: 10, startAngle: 0, arc: 90 });

    // 0..90 is the bottom-right quarter (y grows down), so the box runs from
    // the centre out to (r, r).
    expect(dataItemToOverlayRect(target({ graphics: slice }), null))
      .toEqual({ left: 0, top: 0, width: 10, height: 10 });
  });

  it('falls back to the sprite box for a funnel stage, which is no wedge', () => {
    const slice = stageSprite(20, 40, 120, 30);

    expect(dataItemToOverlayRect(target({ slice }), null))
      .toEqual({ left: 20, top: 40, width: 120, height: 30 });
  });

  it('reports nothing for a mark that reports neither a wedge nor a box', () => {
    // A pie asked before its first layout: a degenerate centre, no radius.
    const slice = wedgeSprite(100, 100, {});

    expect(dataItemToOverlayRect(target({ slice }), null)).toBeNull();
    expect(dataItemToOverlayRect(target({}), null)).toBeNull();
  });

  it('clips a wedge to the panel it belongs to', () => {
    const slice = wedgeSprite(100, 100, { radius: 50, startAngle: -90, arc: 90 });

    expect(dataItemToOverlayRect(
      target({ slice }),
      { left: 0, top: 80, right: 130, bottom: 200 },
    )).toEqual({ left: 100, top: 80, width: 30, height: 20 });
  });
});
