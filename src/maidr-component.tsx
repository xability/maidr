import type { AppStore } from '@state/store';
import type { Maidr as MaidrData } from '@type/grammar';
import type { JSX, ReactNode } from 'react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useMaidrController } from './state/hook/useMaidrController';
import { createMaidrStore } from './state/store';
import { MaidrApp } from './ui/App';

/**
 * Props for the Maidr React component.
 */
export interface MaidrProps {
  /** The MAIDR JSON configuration describing the plot data and structure. */
  data: MaidrData;
  /** The SVG or plot element(s) to make accessible. Rendered inside the figure. */
  children: ReactNode;
}

/**
 * Imperative handle exposed by the {@link Maidr} component via a React ref.
 *
 * Use this to update the chart data programmatically for realtime / streaming
 * data scenarios without re-mounting the component.
 *
 * @example
 * ```tsx
 * import { Maidr, type MaidrRef } from 'maidr/react';
 *
 * function LiveChart() {
 *   const maidrRef = useRef<MaidrRef>(null);
 *
 *   function onNewData(newData: MaidrData) {
 *     maidrRef.current?.setData(newData);
 *   }
 *
 *   return (
 *     <Maidr ref={maidrRef} data={initialData}>
 *       <svg>{...}</svg>
 *     </Maidr>
 *   );
 * }
 * ```
 */
export interface MaidrRef {
  /**
   * Replace the chart data with a new MAIDR JSON configuration.
   *
   * The active Controller (if the chart is currently focused) is transparently
   * rebuilt so that navigation, sonification, and all other services immediately
   * reflect the new data. If the chart is not focused, the new data takes effect
   * on the next focus-in.
   *
   * @param newData - The replacement MAIDR data object.
   */
  setData: (newData: MaidrData) => void;
}

/**
 * React component that provides accessible, non-visual access to statistical
 * visualizations through audio sonification, text descriptions, braille output,
 * and AI-powered descriptions.
 *
 * Supports realtime / streaming data updates via the {@link MaidrRef} handle
 * (obtained through a React ref) or by passing a new `data` prop.
 *
 * @example
 * ```tsx
 * import { Maidr } from 'maidr/react';
 *
 * function MyChart({ chartData }) {
 *   return (
 *     <Maidr data={chartData}>
 *       <svg>{...}</svg>
 *     </Maidr>
 *   );
 * }
 * ```
 */
export const Maidr = forwardRef<MaidrRef, MaidrProps>((
  { data: dataProp, children },
  ref,
): JSX.Element => {
  // Internal data state allows both prop-driven and imperative updates.
  const [data, setData] = useState<MaidrData>(dataProp);

  // Sync internal state when the parent passes a new data prop.
  useEffect(() => {
    setData(dataProp);
  }, [dataProp]);

  // Expose the imperative setData method to parent components via ref.
  useImperativeHandle(ref, () => ({
    setData(newData: MaidrData) {
      setData(newData);
    },
  }), []);

  // Each Maidr instance gets its own isolated Redux store.
  // useRef with lazy init guarantees the store persists for the component's
  // entire lifetime, unlike useMemo which is only a performance hint.
  const storeRef = useRef<AppStore | null>(null);
  if (storeRef.current === null)
    storeRef.current = createMaidrStore();
  const store = storeRef.current;

  const { plotRef, figureRef, contextValue, onFocusIn, onFocusOut } = useMaidrController(data, store);

  return (
    <article id={`maidr-article-${data.id}`}>
      <figure
        ref={figureRef}
        id={`maidr-figure-${data.id}`}
        onFocus={onFocusIn}
        onBlur={onFocusOut}
      >
        <div ref={plotRef} tabIndex={0} style={{ width: 'fit-content' }}>
          {children}
        </div>
        {contextValue && plotRef.current && (
          <div id={`react-container-${data.id}`}>
            <MaidrApp
              plot={plotRef.current}
              store={store}
              contextValue={contextValue}
            />
          </div>
        )}
      </figure>
    </article>
  );
});

Maidr.displayName = 'Maidr';
