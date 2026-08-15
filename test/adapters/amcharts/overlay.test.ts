import type { NavItemTarget, NavTarget } from '@adapters/amcharts/navmap';
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

function target(
  properties: Record<string, unknown>,
  kind: NavItemTarget['kind'] = 'slice',
): NavTarget {
  const dataItem = { get: (key: string) => properties[key] } as unknown as AmDataItem;
  return { series: {} as AmXYSeries, dataItem, kind };
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

  it('measures a word cloud term from the box it reports, rotation included', () => {
    // A cloud turns roughly half its words. The sprite's own corners map to
    // two corners of a tilted box; `globalBounds()` maps all four, which is
    // the box a highlight has to draw.
    const label: AmSprite = {
      globalBounds: () => ({ left: 30, top: 10, right: 46, bottom: 70 }),
      width: () => 60,
      height: () => 16,
      toGlobal: point => ({ x: 30 + point.y, y: 70 - point.x }),
    };

    expect(dataItemToOverlayRect(target({ label }, 'label'), null))
      .toEqual({ left: 30, top: 10, width: 16, height: 60 });
  });

  it('falls back to a term\'s own corners when it reports no box', () => {
    const label: AmSprite = {
      width: () => 60,
      height: () => 16,
      toGlobal: point => ({ x: 30 + point.x, y: 10 + point.y }),
    };

    expect(dataItemToOverlayRect(target({ label }, 'label'), null))
      .toEqual({ left: 30, top: 10, width: 60, height: 16 });
    expect(dataItemToOverlayRect(target({}, 'label'), null)).toBeNull();
  });

  it('clips a wedge to the panel it belongs to', () => {
    const slice = wedgeSprite(100, 100, { radius: 50, startAngle: -90, arc: 90 });

    expect(dataItemToOverlayRect(
      target({ slice }),
      { left: 0, top: 80, right: 130, bottom: 200 },
    )).toEqual({ left: 100, top: 80, width: 30, height: 20 });
  });
});

describe('dataItemToOverlayRect (ribbons)', () => {
  /** A ribbon target: the sprite is resolved before the overlay ever sees it. */
  function ribbon(sprite: AmSprite): NavTarget {
    return { series: {} as AmXYSeries, sprite, kind: 'ribbon' };
  }

  it('measures a flow band from the box it reports', () => {
    // A `SankeyLink` is a curved band, and its local width and height describe
    // a box it does not fill; the reported box is the shape as drawn.
    const band: AmSprite = {
      globalBounds: () => ({ left: 40, top: 12, right: 190, bottom: 60 }),
      width: () => 150,
      height: () => 8,
      toGlobal: point => ({ x: 40 + point.x, y: 12 + point.y }),
    };

    expect(dataItemToOverlayRect(ribbon(band), null))
      .toEqual({ left: 40, top: 12, width: 150, height: 48 });
  });

  it('keeps a straight link visible instead of collapsing it away', () => {
    // A network line between two nodes at the same height reports a box of
    // zero height. That is real geometry rather than the degenerate point of
    // #774, so it is padded to a hairline band — left as it was, the clip
    // would drop it and a perfectly straight link would outline nothing.
    const line: AmSprite = {
      globalBounds: () => ({ left: 20, top: 50, right: 120, bottom: 50 }),
    };

    expect(dataItemToOverlayRect(ribbon(line), { left: 0, top: 0, right: 200, bottom: 200 }))
      .toEqual({ left: 20, top: 49, width: 100, height: 2 });
  });

  it('falls back to a link\'s own corners, and clears when it has neither', () => {
    const laidOut: AmSprite = {
      width: () => 90,
      height: () => 4,
      toGlobal: point => ({ x: 5 + point.x, y: 70 + point.y }),
    };
    const unlaid: AmSprite = {
      globalBounds: () => ({ left: 30, top: 30, right: 30, bottom: 30 }),
    };

    expect(dataItemToOverlayRect(ribbon(laidOut), null))
      .toEqual({ left: 5, top: 70, width: 90, height: 4 });
    expect(dataItemToOverlayRect(ribbon(unlaid), null)).toBeNull();
  });
});
