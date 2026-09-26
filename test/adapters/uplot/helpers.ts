import type { UPlotAxis, UPlotInstance, UPlotScale, UPlotSeries } from '@adapters/uplot/types';

/** The flags uPlot's own path builders leave on `series._paths`. */
export const LINE_PATHS = { flags: 1 };
export const BAR_PATHS = { flags: 0 };
export const POINT_PATHS = { flags: 3 };

/** A fake instance with its hook table, as a uPlot instance holds it. */
export type FakeUPlot = UPlotInstance & {
  hooks: Record<string, Array<(u: UPlotInstance) => void>>;
  data: UPlotInstance['data'];
  status: number;
  setCursor: jest.Mock;
  cursor: { idx?: number | null; left?: number; top?: number };
};

export interface FakeUPlotInit {
  data: UPlotInstance['data'];
  series: UPlotSeries[];
  axes?: UPlotAxis[];
  scales?: Record<string, UPlotScale>;
  mode?: number;
  status?: number;
  title?: string;
  rootId?: string;
}

/**
 * Builds a duck-typed uPlot instance: a `.uplot` root holding an optional
 * `.u-title` and the `.u-over` plotting-area div, a linear `valToPos` over
 * each scale's `min`/`max` onto a 400 x 200 plot, and a hook table of arrays.
 *
 * @param init - Data, series and the rest of what the adapter reads
 * @returns The instance; not attached to the document
 */
export function fakeUPlot(init: FakeUPlotInit): FakeUPlot {
  const root = document.createElement('div');
  root.className = 'uplot';
  if (init.rootId) {
    root.id = init.rootId;
  }
  if (init.title !== undefined) {
    const title = document.createElement('div');
    title.className = 'u-title';
    title.textContent = init.title;
    root.appendChild(title);
  }
  const over = document.createElement('div');
  over.className = 'u-over';
  root.appendChild(over);

  const scales: Record<string, UPlotScale> = init.scales ?? {
    x: { min: 0, max: 10, ori: 0 },
    y: { min: 0, max: 100, ori: 1 },
  };
  const valToPos = (val: number, key: string): number => {
    const scale = scales[key] ?? { min: 0, max: 1 };
    const min = scale.min ?? 0;
    const max = scale.max ?? 1;
    const vertical = scale.ori === 1;
    const size = vertical ? 200 : 400;
    const share = (val - min) / (max - min);
    return vertical ? size * (1 - share) : size * share;
  };

  return {
    root,
    over,
    data: init.data,
    series: init.series,
    axes: init.axes ?? [{ scale: 'x' }, { scale: 'y' }],
    scales,
    mode: init.mode,
    status: init.status ?? 1,
    valToPos,
    setCursor: jest.fn(),
    cursor: {},
    hooks: {},
  };
}

/**
 * Fires a hook the way uPlot does: every function in the list, in order.
 *
 * @param u - The instance
 * @param name - The hook name
 */
export function fire(u: FakeUPlot, name: string): void {
  for (const fn of [...(u.hooks[name] ?? [])]) {
    fn(u);
  }
}
