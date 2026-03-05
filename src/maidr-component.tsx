import type { AppStore } from '@state/store';
import type { Maidr as MaidrData } from '@type/grammar';
import type { JSX, ReactNode } from 'react';
import { useMemo, useRef } from 'react';
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
 * React component that provides accessible, non-visual access to statistical
 * visualizations through audio sonification, text descriptions, braille output,
 * and AI-powered descriptions.
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
/**
 * Derives a static instruction string from the MAIDR configuration for the
 * initial render. This replicates what the old throwaway Controller / Context
 * produced via {@link Context.getInstruction} so that screen readers can
 * discover the chart (e.g. NVDA "g" key) before the user focuses it.
 *
 * Once the Controller is created on focus-in, {@link DisplayService} overwrites
 * these attributes with the authoritative values.
 */
function getInitialInstruction(data: MaidrData): string {
  const subplots = data.subplots;
  const subplotCount = subplots.flat().length;

  if (subplotCount > 1) {
    return `This is a maidr figure containing ${subplotCount} subplots. Click to activate. Use arrow keys to navigate subplots and press 'ENTER'.`;
  }

  // Single subplot — describe the first layer's trace type.
  const firstSubplot = subplots[0]?.[0];
  const layerCount = firstSubplot?.layers.length ?? 0;
  const traceType = firstSubplot?.layers[0]?.type ?? 'chart';

  if (layerCount > 1) {
    return `This is a maidr plot containing ${layerCount} layers, and this is layer 1 of ${layerCount}: ${traceType} plot. Click to activate. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.`;
  }

  return `This is a maidr plot of type: ${traceType}. Click to activate. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.`;
}

export function Maidr({ data, children }: MaidrProps): JSX.Element {
  // Each Maidr instance gets its own isolated Redux store.
  // useRef with lazy init guarantees the store persists for the component's
  // entire lifetime, unlike useMemo which is only a performance hint.
  const storeRef = useRef<AppStore | null>(null);
  if (storeRef.current === null)
    storeRef.current = createMaidrStore();
  const store = storeRef.current;

  const { plotRef, figureRef, contextValue, onFocusIn, onFocusOut } = useMaidrController(data, store);

  // Compute the initial instruction once so the plot is discoverable by screen
  // readers (role="img" + aria-label) before any user interaction.
  const initialInstruction = useMemo(() => getInitialInstruction(data), [data]);

  return (
    <article id={`maidr-article-${data.id}`}>
      <figure
        ref={figureRef}
        id={`maidr-figure-${data.id}`}
        onFocus={onFocusIn}
        onBlur={onFocusOut}
      >
        <div
          ref={plotRef}
          tabIndex={0}
          role="img"
          aria-label={initialInstruction}
          title={initialInstruction}
          style={{ width: 'fit-content' }}
        >
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
}
