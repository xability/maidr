/**
 * Mounts MAIDR inside a Power BI custom visual.
 *
 * A custom visual is handed one element in its constructor and a fresh data
 * view on every `update()`. {@link bindPowerBI} owns everything in between: it
 * appends one wrapper to that element, renders MAIDR's accessible layer into it,
 * and on each update converts the data view and re-renders — or, when the
 * data is what is already mounted (a resize, a format-pane change), does
 * nothing, so a reader inside the chart is not disturbed by a report author
 * dragging the visual's corner.
 *
 * It runs in two modes, told apart by whether the visual hands over its own
 * drawing:
 *
 * - **Chart mode** (`chart` given): the visual's SVG or canvas is moved inside
 *   MAIDR's figure, so the reader's focus and the visual share one element and
 *   `onNavigate` can highlight the mark MAIDR is on.
 * - **Companion mode** (no `chart`): MAIDR renders only its keyboard entry
 *   point. The visual sits beside a native Power BI visual bound to the same
 *   fields, so authors keep the native chart for sighted readers and add a
 *   non-visual reading of the same data next to it.
 *
 * @example
 * ```ts
 * import { bindPowerBI } from 'maidr/powerbi';
 *
 * export class Visual implements powerbi.extensibility.visual.IVisual {
 *   private readonly maidr;
 *
 *   constructor(options: VisualConstructorOptions) {
 *     this.maidr = bindPowerBI(options.element, { chartType: 'column' });
 *   }
 *
 *   update(options: VisualUpdateOptions): void {
 *     this.maidr.update(options.dataViews?.[0]);
 *   }
 *
 *   destroy(): void {
 *     this.maidr.dispose();
 *   }
 * }
 * ```
 */

import type { JSX } from 'react';
import type { Root as ReactRoot } from 'react-dom/client';
import type { Maidr as MaidrData, NavigateCallback, NavigationTarget } from '../../type/grammar';
import type { PowerBIConversion } from './converter';
import type { PowerBIAdapterOptions, PowerBIDataPointRef, PowerBIDataView } from './types';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from '../../maidr-component';
import { liveDataManager } from '../../service/liveData';
import { convertPowerBIDataView, nextFigureId, resolvePowerBIDataPoints } from './converter';

/**
 * Options for {@link bindPowerBI}.
 */
export interface PowerBIBindOptions extends PowerBIAdapterOptions {
  /**
   * The visual's own drawing. Moved inside MAIDR's figure, so it becomes the
   * chart the reader navigates. Omit it for companion mode.
   */
  readonly chart?: HTMLElement | SVGElement;
  /**
   * Called as the reader moves, with the data points under MAIDR's cursor,
   * and with `null` when the reader leaves the chart. Highlight the marks, or
   * build selection ids from the refs and call `selectionManager.select()`.
   */
  readonly onNavigate?: (points: readonly PowerBIDataPointRef[] | null) => void;
  /**
   * The text of companion mode's entry point. Default: the title, or
   * "Accessible chart".
   */
  readonly label?: string;
  /**
   * Adopt new data while the reader is inside the chart. Off by default: a
   * slicer changed by a colleague should not move the ground under someone
   * reading, so MAIDR picks the new data up when the reader next enters.
   */
  readonly live?: boolean;
}

/**
 * A mounted binding, returned by {@link bindPowerBI}.
 */
export interface PowerBIBinding {
  /**
   * Convert a data view and show it. Call from the visual's `update()`.
   *
   * @param dataView - `options.dataViews[0]`; `undefined` clears the figure.
   * @param options - Overrides for this and later updates, e.g. a `chartType`
   * or `title` read from the format pane.
   * @returns The conversion now mounted, or `null` when the data view held
   * nothing to navigate.
   */
  update: (dataView: PowerBIDataView | undefined, options?: Partial<PowerBIAdapterOptions>) => PowerBIConversion | null;
  /**
   * Move MAIDR's cursor to a data point — what a click on the visual's own
   * mark should call, so a sighted colleague pointing at a bar and a
   * screen-reader user land on the same one.
   *
   * @param ref - The data point, or `null` to withdraw a pending move.
   * @returns Whether MAIDR accepted it.
   */
  navigateTo: (ref: PowerBIDataPointRef | null) => boolean;
  /** The conversion currently mounted. */
  readonly conversion: PowerBIConversion | null;
  /** Unmount MAIDR, remove the wrapper, and hand the chart back. */
  dispose: () => void;
}

interface ChartHostProps {
  readonly node: HTMLElement | SVGElement;
}

/**
 * Hosts the visual's own drawing inside the React tree without React owning
 * it: the node is appended once and taken out again on unmount.
 */
function ChartHost({ node }: ChartHostProps): JSX.Element {
  const ref = useCallback((container: HTMLDivElement | null) => {
    if (container !== null && !container.contains(node)) {
      container.appendChild(node);
    }
  }, [node]);
  return <div ref={ref} data-maidr-powerbi-chart="" style={{ width: '100%', height: '100%' }} />;
}

function sameRef(a: PowerBIDataPointRef | null, b: PowerBIDataPointRef): boolean {
  if (a === null || a.kind !== b.kind) {
    return false;
  }
  if (a.kind === 'table' && b.kind === 'table') {
    return a.rowIndex === b.rowIndex;
  }
  return a.kind === 'categorical' && b.kind === 'categorical'
    && a.categoryIndex === b.categoryIndex
    && a.valueColumnIndex === b.valueColumnIndex;
}

/**
 * Find the MAIDR position a data point was converted to.
 */
function positionOf(conversion: PowerBIConversion, ref: PowerBIDataPointRef): NavigationTarget | null {
  for (const [layerId, points] of conversion.points) {
    const pointIndex = points.findIndex(point => sameRef(point, ref));
    if (pointIndex !== -1) {
      return { layerId, pointIndex };
    }
  }
  for (const [layerId, rows] of conversion.cells) {
    for (let row = 0; row < rows.length; row++) {
      const col = rows[row].findIndex(cell => sameRef(cell, ref));
      if (col !== -1) {
        return { layerId, row, col };
      }
    }
  }
  return null;
}

/**
 * What decides whether an update changed anything a reader can hear.
 *
 * The refs are part of it: the same numbers read from different cells route a
 * highlight to different marks.
 */
function fingerprint(conversion: PowerBIConversion | null): string {
  if (conversion === null) {
    return 'null';
  }
  return JSON.stringify([
    conversion.maidr,
    [...conversion.cells],
    [...conversion.points],
  ]);
}

/**
 * Mount MAIDR inside a Power BI custom visual.
 *
 * Nothing is navigable until the first {@link PowerBIBinding.update}; call it
 * from the visual's `update()` with `options.dataViews[0]`.
 *
 * @param element - The element Power BI handed the visual's constructor
 * (`options.element`). A wrapper is appended to it; nothing else is touched.
 * @param options - What the visual draws, and how MAIDR reports back.
 * @returns The binding.
 */
export function bindPowerBI(element: HTMLElement, options: PowerBIBindOptions): PowerBIBinding {
  const figureId = options.id ?? nextFigureId();
  let current: PowerBIBindOptions = { ...options, id: figureId };

  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-maidr-powerbi', figureId);
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';
  element.appendChild(wrapper);
  const root: ReactRoot = createRoot(wrapper, { identifierPrefix: figureId });

  let conversion: PowerBIConversion | null = null;
  let mounted = '';
  let disposed = false;

  const render = (): void => {
    const chart = current.chart;
    if (conversion === null) {
      // Nothing to navigate: `Figure` cannot be built from an empty subplot,
      // so MAIDR is not mounted at all. The visual's drawing stays visible.
      root.render(chart ? <ChartHost node={chart} /> : null);
      return;
    }

    // One closure per conversion. The controller keeps the `onNavigate` of the
    // data it was built from until the reader re-enters, so a position is
    // always resolved against the figure the reader is actually navigating.
    const shown = conversion;
    const onNavigate: NavigateCallback = (info) => {
      current.onNavigate?.(info === null ? null : resolvePowerBIDataPoints(shown, info));
    };
    const data: MaidrData = {
      ...shown.maidr,
      ...(current.live === true ? { live: true } : {}),
      onNavigate,
    };
    const label = current.label ?? current.title ?? 'Accessible chart';
    root.render(
      <MaidrComponent data={data}>
        {chart ? <ChartHost node={chart} /> : <div data-maidr-powerbi-anchor="">{label}</div>}
      </MaidrComponent>,
    );
  };

  return {
    update(dataView, overrides) {
      if (disposed) {
        return null;
      }
      if (overrides !== undefined) {
        current = { ...current, ...overrides, id: figureId };
      }
      const next = convertPowerBIDataView(dataView, current);
      const key = fingerprint(next);
      if (key === mounted) {
        return conversion;
      }
      conversion = next;
      mounted = key;
      render();
      return conversion;
    },
    navigateTo(ref) {
      if (disposed || conversion === null) {
        return false;
      }
      if (ref === null) {
        return liveDataManager.navigateTo(null, { id: figureId });
      }
      const target = positionOf(conversion, ref);
      return target !== null && liveDataManager.navigateTo(target, { id: figureId });
    },
    get conversion() {
      return conversion;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      root.unmount();
      wrapper.remove();
      // Hand the drawing back where the visual can still reach it.
      if (current.chart && !element.contains(current.chart)) {
        element.appendChild(current.chart);
      }
    },
  };
}
