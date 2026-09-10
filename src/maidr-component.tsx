import type { AppStore } from '@state/store';
import type { Maidr as MaidrData } from '@type/grammar';
import type { JSX, ReactNode, PointerEvent as ReactPointerEvent } from 'react';
import { plotTypeLabel } from '@model/abstract';
import { TraceType } from '@type/grammar';
import { t } from '@util/i18n';
import { formatPlotType, resolveOrientation } from '@util/orientation';
import { useCallback, useMemo, useRef } from 'react';
import { useLocale } from './state/hook/useLocale';
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
  // Every sentence below is rendered from the same message keys
  // `Context.getInstruction` uses, so the label a reader hears before the
  // chart is focused and the one they hear after it say the same thing in
  // whatever language is active.
  const clickPrompt = t('model.instructionClickPrompt');

  if (subplotCount > 1) {
    return t('model.initialInstructionFigure', { size: subplotCount, clickPrompt });
  }

  // Single subplot — describe the first layer's trace type.
  const firstSubplot = subplots[0]?.[0];
  const layerCount = firstSubplot?.layers.length ?? 0;
  const firstLayer = firstSubplot?.layers[0];
  const traceType = firstLayer?.type;

  // Normalize line plot type: data is LinePoint[][] where outer array = groups.
  // A line trace with exactly 1 group is "single line", not "multiline".
  let plotType: string = traceType === undefined
    ? t('model.plotTypeUnknownChart')
    : plotTypeLabel(traceType);
  let groupCountText = '';
  if (traceType === TraceType.LINE && Array.isArray(firstLayer?.data)) {
    const groupCount = firstLayer.data.length;
    if (groupCount > 1) {
      plotType = t('model.plotTypeMultiline');
      groupCountText = t('model.instructionGroupCount', { count: groupCount });
    } else {
      plotType = t('model.plotTypeSingleLine');
    }
  } else if (traceType === TraceType.STEP && Array.isArray(firstLayer?.data)) {
    // A step trace keeps calling itself 'step' whatever its series count —
    // only the group count is added, matching what StepTrace reports once the
    // model exists. The two builders have to agree or the announcement
    // changes when the user clicks.
    const groupCount = firstLayer.data.length;
    if (groupCount > 1) {
      groupCountText = t('model.instructionGroupCount', { count: groupCount });
    }
  }

  // Resolved the same way the trace model resolves it, so the pre-activation
  // announcement and the one DisplayService writes on focus-in agree.
  const displayType = formatPlotType(
    plotType,
    resolveOrientation(traceType ?? '', firstLayer?.orientation),
  );

  if (layerCount > 1) {
    return t('model.initialInstructionSubplot', {
      size: layerCount,
      index: 1,
      plotType: displayType,
      clickPrompt,
    });
  }

  return t('model.instructionTrace', {
    displayType,
    groupCount: groupCountText,
    clickPrompt,
  });
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
  const { locale } = useLocale();

  // Compute the initial instruction once so the plot is discoverable by screen
  // readers (role="img" + aria-label) before any user interaction.
  // `locale` is a dependency because the instruction is built from translated
  // messages: without it the pre-activation label would keep the language the
  // chart first rendered in.
  const initialInstruction = useMemo(() => getInitialInstruction(data), [data, locale]);

  // Click-to-activate shim: most chart libraries render the plot as inert SVG
  // children of our `tabIndex={0}` wrapper. Browsers do NOT auto-focus a
  // tabbable ancestor when one of its children is clicked, so without this
  // handler MAIDR only activates via the Tab key. We focus the wrapper on
  // pointer-down (matching how the SVG-based adapters behave) only when focus
  // isn't already inside it, to avoid stealing focus from inner interactive
  // elements (e.g. tooltips, chart UI buttons).
  const handlePointerDown = useCallback((_event: ReactPointerEvent<HTMLDivElement>) => {
    const plot = plotRef.current;
    if (plot && !plot.contains(document.activeElement)) {
      plot.focus();
    }
  }, [plotRef]);

  return (
    <article id={`maidr-article-${data.id}`} lang={locale}>
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
          onPointerDown={handlePointerDown}
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
