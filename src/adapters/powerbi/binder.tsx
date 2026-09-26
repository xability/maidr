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
import { flushSync } from 'react-dom';
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
   * and with `null` when the reader leaves the chart — focus moves out of the
   * visual, or the visual's frame loses focus to another part of the report.
   * Highlight the marks, or build selection ids from the refs and call
   * `selectionManager.select()`; clear them on `null`.
   */
  readonly onNavigate?: (points: readonly PowerBIDataPointRef[] | null) => void;
  /**
   * The visible text of companion mode's entry point. Default: the title, or
   * "Accessible chart". Screen readers hear MAIDR's own instruction instead:
   * the entry point is an image to them, named by MAIDR.
   */
  readonly label?: string;
  /**
   * What the focusable empty state says when the data view holds nothing to
   * navigate — no fields bound, or a filter that leaves no rows. Default
   * "No data to read".
   */
  readonly emptyLabel?: string;
  /**
   * Apply new data in place while the reader is inside the chart, keeping
   * their position. **On by default**, unlike the Tableau binder: a visual's
   * frame keeps its focused element when the reader moves to a slicer, so
   * MAIDR cannot tell that they left, and data held back "until they leave"
   * would be held until they happened to tab out of the visual — the reader
   * would come back from changing a filter to the unfiltered chart. Pass
   * `false` to hold new data until focus leaves the visual itself.
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

/**
 * Kept visible for a screen reader only, where the visual's own drawing
 * already shows its empty state.
 */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

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
  // The conversion MAIDR's running controller navigates, which `navigateTo`
  // must address. Only differs from `conversion` with `live: false`: then
  // `useMaidrController` keeps navigating the previous data until focus
  // leaves the figure, so a newer conversion is staged in `pending` until
  // then — otherwise a click on a mark would move MAIDR to that mark's
  // position in data it is not showing.
  let navigated: PowerBIConversion | null = null;
  let pending: PowerBIConversion | null = null;
  let mounted = '';
  let disposed = false;
  // Whether the visual was last told about a position, so leaving reports the
  // `null` that clears it exactly once.
  let reported = false;

  const report = (points: readonly PowerBIDataPointRef[] | null): void => {
    reported = points !== null;
    current.onNavigate?.(points);
  };

  // Deferred by a task and re-checked, as `useMaidrController` does: focus
  // moving between two elements inside the figure also fires `focusout`.
  // MAIDR itself reports nothing when focus leaves — its controller is simply
  // disposed — so the selection it drove is cleared here, as the Tableau
  // binder does. The frame losing focus counts as leaving: the reader went
  // to another visual or a slicer, and a cross-highlight should not outlive
  // the cursor that put it there.
  const handleFocusOut = (): void => {
    setTimeout(() => {
      if (disposed) {
        return;
      }
      const inside = wrapper.contains(document.activeElement);
      if (!inside && pending !== null) {
        navigated = pending;
        pending = null;
      }
      if (reported && (!inside || !document.hasFocus())) {
        report(null);
      }
    }, 0);
  };
  wrapper.addEventListener('focusout', handleFocusOut);

  const isLive = (): boolean => current.live !== false;

  const render = (): void => {
    const chart = current.chart;
    if (conversion === null) {
      // Nothing to navigate: `Figure` cannot be built from an empty subplot,
      // so MAIDR is not mounted. A focusable empty state takes its place, so a
      // reader whose chart was just filtered to nothing is told so rather
      // than dropped onto the frame's body with nothing to reach.
      const empty = current.emptyLabel ?? 'No data to read';
      root.render(
        <>
          {chart ? <ChartHost node={chart} /> : null}
          <div
            data-maidr-powerbi-empty=""
            role="status"
            tabIndex={0}
            style={chart ? VISUALLY_HIDDEN : undefined}
          >
            {empty}
          </div>
        </>,
      );
      return;
    }

    // One closure per conversion. The controller keeps the `onNavigate` of the
    // data it was built from until it is rebuilt, so a position is always
    // resolved against the figure the reader is actually navigating.
    const shown = conversion;
    const onNavigate: NavigateCallback = (info) => {
      report(info === null ? null : resolvePowerBIDataPoints(shown, info));
    };
    const data: MaidrData = {
      ...shown.maidr,
      ...(isLive() ? { live: true } : {}),
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
      const hadFocus = wrapper.contains(document.activeElement);
      const wasEmpty = conversion === null;
      conversion = next;
      mounted = key;
      if (isLive() || next === null || wasEmpty || !hadFocus) {
        navigated = next;
        pending = null;
      } else {
        pending = next;
      }
      // Committed synchronously, effects included, so MAIDR holds the new
      // data by the time `update()` returns: a `navigateTo` the visual makes
      // straight afterwards — re-applying its current selection — is resolved
      // and delivered against the figure it names, rather than being dropped
      // when the data effect lands a tick later.
      flushSync(render);
      // Swapping the figure for the empty state (or back) unmounts the element
      // that had focus; hand it to whatever took its place.
      if (hadFocus && !wrapper.contains(document.activeElement)) {
        wrapper.querySelector<HTMLElement>('[tabindex]')?.focus();
      }
      return conversion;
    },
    navigateTo(ref) {
      if (disposed || navigated === null) {
        return false;
      }
      if (ref === null) {
        return liveDataManager.navigateTo(null, { id: figureId });
      }
      const target = positionOf(navigated, ref);
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
      navigated = null;
      pending = null;
      wrapper.removeEventListener('focusout', handleFocusOut);
      root.unmount();
      wrapper.remove();
      // Hand the drawing back where the visual can still reach it.
      if (current.chart && !element.contains(current.chart)) {
        element.appendChild(current.chart);
      }
    },
  };
}
