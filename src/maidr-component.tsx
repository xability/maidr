import type { AppStore } from '@state/store';
import type { Maidr as MaidrData } from '@type/grammar';
import type { JSX, ReactNode, PointerEvent as ReactPointerEvent } from 'react';
import { TraceType } from '@type/grammar';
import { Constant } from '@util/constant';
import { ensureDocumentStyle } from '@util/documentStyle';
import { t } from '@util/i18n';
import { formatPlotType, resolveOrientation } from '@util/orientation';
import { plotTypeLabel } from '@util/plotTypeLabel';
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
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

/**
 * Takes the browser's default side margins, 40px each, off MAIDR's figure.
 * On a page that leaves figures unstyled they indent the chart, and they make
 * a frame sized to fit the chart 80px wider than the chart (#1375).
 *
 * `:where()` gives the rule no specificity, so it only overrides the
 * browser's default. Any margin a page sets on its figures still applies,
 * such as `margin: auto` to centre them.
 */
const FIGURE_MARGIN_RULE = ':where(figure[id^="maidr-figure-"]) { margin-left: 0; margin-right: 0; }';

/** The plot element MAIDR makes focusable around a chart. */
const PLOT = 'figure[id^="maidr-figure-"] > div[tabindex="0"]';

/**
 * A chart bound from the page -- by a script tag, or by r-maidr and
 * py-maidr -- rather than rendered by a React app. `initMaidrOnElement` marks
 * the element it mounts the chart in.
 */
const EMBEDDED = `:where([${Constant.MAIDR_EMBED}]) > article[id^="maidr-article-"]`;

/**
 * A visible focus (WCAG 2.4.7) for the chart and for MAIDR's own fields.
 *
 * Two strengths. A React app has a focus design of its own, so its charts get
 * a ring with no specificity at all, on keyboard focus only, which any rule
 * of the app's replaces. A chart bound from the page shares it with
 * stylesheets that were never written with a chart in mind, and some remove
 * every outline (`*:focus { outline: none !important }`, or a slide theme's
 * `.cell-output-display * { ... }`): there the ring is `!important` and
 * specific enough to outlast them, and shows on every focus, a click
 * included, as the bindings' own rings always have.
 *
 * The ring is drawn inside the plot, since a slide, a card or a notebook
 * cell that clips its overflow would cut off one drawn outside it. A light
 * band inside it, the outline of the chart's own `<svg>`, keeps it visible on
 * a dark plot; the `<svg>` sits directly in the plot, or inside the
 * `display: contents` element a chart bound from the page is adopted into.
 * Both colours can be set by a page, through `--maidr-focus-ring-color` and
 * `--maidr-focus-ring-inner`. Under forced colours the ring takes the
 * system's highlight colour and the band goes.
 *
 * A Plotly chart draws its ring on Plotly's own container instead, and the
 * Plotly adapter turns these off with a more specific rule.
 */
const FOCUS_RING_RULES = `
:where(${PLOT}:focus-visible) {
  outline: 3px solid var(--maidr-focus-ring-color, #1a5fb4);
  outline-offset: -3px;
}
${EMBEDDED} > ${PLOT}:focus {
  outline: 3px solid var(--maidr-focus-ring-color, #1a5fb4) !important;
  outline-offset: -3px !important;
}
${EMBEDDED} > ${PLOT}:focus > svg,
${EMBEDDED} > ${PLOT}:focus > div > svg {
  outline: 2px solid var(--maidr-focus-ring-inner, #fff) !important;
  outline-offset: -5px !important;
}
${EMBEDDED} :is(textarea, input, select):focus,
${EMBEDDED} :is(button, a, [role="button"]):focus-visible {
  outline: 3px solid var(--maidr-focus-ring-color, #1a5fb4) !important;
  outline-offset: 1px !important;
}
@media (forced-colors: active) {
  :where(${PLOT}:focus-visible) {
    outline-color: Highlight;
  }
  ${EMBEDDED} > ${PLOT}:focus,
  ${EMBEDDED} :is(textarea, input, select):focus,
  ${EMBEDDED} :is(button, a, [role="button"]):focus-visible {
    outline-color: Highlight !important;
  }
  ${EMBEDDED} > ${PLOT}:focus > svg,
  ${EMBEDDED} > ${PLOT}:focus > div > svg {
    outline: none !important;
  }
}
`;

export function Maidr({ data, children }: MaidrProps): JSX.Element {
  // Each Maidr instance gets its own isolated Redux store.
  // useRef with lazy init guarantees the store persists for the component's
  // entire lifetime, unlike useMemo which is only a performance hint.
  const storeRef = useRef<AppStore | null>(null);
  if (storeRef.current === null)
    storeRef.current = createMaidrStore();
  const store = storeRef.current;

  const { plotRef, figureRef, contextValue, onFocusIn, onFocusOut } = useMaidrController(data, store);
  const { locale, revision } = useLocale();

  // Before the first paint, so the chart is never drawn indented.
  useLayoutEffect(() => {
    const doc = figureRef.current?.ownerDocument;
    if (doc) {
      ensureDocumentStyle(doc, 'data-maidr-figure', FIGURE_MARGIN_RULE);
      ensureDocumentStyle(doc, 'data-maidr-focus-ring', FOCUS_RING_RULES);
    }
  }, [figureRef]);

  // Compute the initial instruction once so the plot is discoverable by screen
  // readers (role="img" + aria-label) before any user interaction.
  // `revision` is a dependency because the instruction is built from
  // translated messages: it advances on a language change and when the
  // language's pack arrives, which leaves `locale` itself unchanged.
  const initialInstruction = useMemo(() => getInitialInstruction(data), [data, revision]);

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
