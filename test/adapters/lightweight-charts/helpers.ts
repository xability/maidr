import type {
  LwcChart,
  LwcDataItem,
  LwcPane,
  LwcSeries,
  LwcSeriesOptions,
} from '@adapters/lightweight-charts/types';

/** A box as `getBoundingClientRect` reports one. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function boxed(box: Box): { getBoundingClientRect: () => DOMRect } {
  return {
    getBoundingClientRect: () => ({
      ...box,
      x: box.left,
      y: box.top,
      right: box.left + box.width,
      bottom: box.top + box.height,
      toJSON: () => box,
    }) as DOMRect,
  };
}

/**
 * A series whose data can be replaced, and whose data-changed handlers can be
 * fired. Like the real `series.data()`, it leaves out whitespace rows.
 */
export interface FakeSeries extends LwcSeries {
  setRows: (rows: LwcDataItem[]) => void;
  fire: (scope: 'full' | 'update') => void;
}

/**
 * A series with the given type, rows and options. Prices map to y linearly:
 * `y = priceOrigin - price * priceScale`.
 */
export function fakeSeries(
  type: string,
  rows: LwcDataItem[],
  options: LwcSeriesOptions = {},
  priceOrigin = 300,
  priceScale = 1,
): FakeSeries {
  let data = rows;
  const handlers = new Set<(scope: 'full' | 'update') => void>();
  return {
    seriesType: () => type,
    data: () => data.filter(row => Object.keys(row).some(key => key !== 'time')),
    options: () => options,
    priceToCoordinate: price => priceOrigin - price * priceScale,
    subscribeDataChanged: handler => handlers.add(handler),
    unsubscribeDataChanged: handler => handlers.delete(handler),
    setRows: (next) => {
      data = next;
    },
    fire: scope => handlers.forEach(handler => handler(scope)),
  };
}

/** One pane of series, laid out at `box` within the chart element. */
export interface FakePaneSpec {
  series: LwcSeries[];
  box?: Box;
}

/**
 * A chart of panes. The chart element sits at (0, 0); time `t` is drawn at
 * `x = t * timeScale` within the plot, and bars are `barSpacing` apart.
 */
export function fakeChart(
  panes: FakePaneSpec[],
  {
    containerId = '',
    leftScaleWidth = 0,
    plotWidth = 500,
    timeScale = 1,
    barSpacing = 10,
    visible = (_time: unknown) => true,
  }: {
    containerId?: string;
    leftScaleWidth?: number;
    plotWidth?: number;
    timeScale?: number;
    barSpacing?: number;
    visible?: (time: unknown) => boolean;
  } = {},
): LwcChart {
  const container = { id: containerId };
  const chartElement = { ...boxed({ left: 0, top: 0, width: 600, height: 400 }), parentElement: container };
  const lwcPanes: LwcPane[] = panes.map((spec, index) => {
    const box = spec.box ?? { left: 0, top: index * 200, width: 600, height: 200 };
    return {
      paneIndex: () => index,
      getSeries: () => spec.series,
      getHeight: () => box.height,
      getHTMLElement: () => boxed(box) as unknown as HTMLElement,
      attachPrimitive: () => {},
      detachPrimitive: () => {},
    };
  });
  return {
    panes: () => lwcPanes,
    timeScale: () => ({
      timeToCoordinate: time => (visible(time) && typeof time === 'number' ? time * timeScale : null),
      logicalToCoordinate: logical => logical * barSpacing,
      width: () => plotWidth,
      subscribeVisibleLogicalRangeChange: () => {},
      unsubscribeVisibleLogicalRangeChange: () => {},
    }),
    priceScale: (id: string) => ({ width: () => (id === 'left' ? leftScaleWidth : 50) }),
    paneSize: (index = 0) => ({ width: plotWidth, height: lwcPanes[index]?.getHeight() ?? 0 }),
    takeScreenshot: () => {
      throw new Error('not drawn');
    },
    chartElement: () => chartElement as unknown as HTMLDivElement,
  };
}

/** Midnight UTC on the given day of January 2025, in seconds. */
export function day(n: number): number {
  return Date.UTC(2025, 0, n) / 1000;
}
