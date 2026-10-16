import type { AppStore } from '@state/store';
import type { Maidr as MaidrData } from '@type/grammar';
import type { JSX, ReactNode, PointerEvent as ReactPointerEvent } from 'react';
import { TraceType } from '@type/grammar';
import { chartTypeLabel } from '@util/chartTypeLabel';
import { Constant } from '@util/constant';
import { ensureDocumentStyle } from '@util/documentStyle';
import { t } from '@util/i18n';
import { currentInstructionId, describeWithInstruction, initialInstructionId, withKeyboardHelp } from '@util/instruction';
import { formatPlotType, resolveOrientation } from '@util/orientation';
import { plotTypeLabel } from '@util/plotTypeLabel';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
 * produced via {@link Context.getInstruction}, so that a screen reader can
 * tell a reader how to use the chart before they focus it.
 *
 * It is the chart's description, not its name (#1384). Once the Controller is
 * created on focus-in, {@link DisplayService} describes the chart with the
 * authoritative instructions instead, for wherever the reader is.
 */
function getInitialInstruction(data: MaidrData): string {
  const subplots = data.subplots;
  const subplotCount = subplots.flat().length;
  // Every sentence below is rendered from the same message keys
  // `Context.getInstruction` uses, so the label a reader hears before the
  // chart is focused and the one they hear after it say the same thing in
  // whatever language is active.
  const clickPrompt = t('model.instructionClickPrompt');

  // No subplot with a layer means no subplot can be entered and no point
  // read, however many panels there are (#1429).
  if (subplots.flat().every(subplot => (subplot?.layers.length ?? 0) === 0)) {
    return t('model.instructionEmptyFigure', { clickPrompt });
  }

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
 * The chart's accessible name: what it is, not how to use it (#1384). Its
 * title and its type, or its type alone when it has none.
 *
 * A name is what a screen reader lists graphics by, jumps between them by
 * and reads every time it reaches one, and what a braille display shows and
 * voice control targets. The instructions used to be the name, so every chart
 * read "This is a maidr plot of type: …", two charts of one type could not be
 * told apart, and a reader who knew the keys could not stop hearing them.
 * They are the chart's description now ({@link getInitialInstruction}).
 *
 * The title is the figure's, or, for a single panel, its first layer's:
 * producers give every layer the chart's title. A figure of several panels
 * with no title of its own is named by its panel count, as no one panel names
 * it.
 *
 * @param data - The chart's MAIDR data
 * @returns The name, e.g. `Tips by day, Bar Chart`
 */
function getChartName(data: MaidrData): string {
  const subplots = data.subplots.flat();
  const layers = subplots.length === 1 ? (subplots[0]?.layers ?? []) : [];

  let type: string;
  if (subplots.length > 1) {
    type = t('model.chartNameFigure', { size: subplots.length });
  } else if (layers.length > 1) {
    type = t('model.chartNameLayers', { size: layers.length });
  } else {
    const traceType = layers[0]?.type;
    type = traceType === undefined ? t('model.plotTypeUnknownChart') : chartTypeLabel(traceType);
  }

  const title = titleText(data.title) || titleText(layers[0]?.title);
  return title ? t('model.chartNameTitled', { title, type }) : type;
}

/**
 * A title as the chart's name can use it: trimmed, or '' for none.
 *
 * Not every producer sends a string: r-maidr writes a layer with no title as
 * `"title": {}`, R's empty list, which the name must read as none rather than
 * fail the chart's first render on.
 *
 * @param title - The title as the producer sent it
 * @returns The title, or '' when there is none
 */
function titleText(title: unknown): string {
  return typeof title === 'string' ? title.trim() : '';
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

/**
 * The reader's high contrast pair on MAIDR's braille and review fields, both
 * colours at once, while high contrast mode is painted.
 *
 * High contrast paints the chart's backdrop dark with light text, and sets
 * the same two colours on it as custom properties (see `overrideInlineStyles`
 * in `HighContrastService`), which this rule reads; restoring removes them,
 * and the rule goes with them. Without it the fields took whatever the page's
 * cascade left them. A reset that makes fields inherit their text colour
 * (normalize.css v3, so Bootstrap 3 and every rmarkdown page; Tailwind 3's
 * preflight) gave them the light text over the browser's white field, and a
 * reset that clears their background left the browser's black text on the
 * dark backdrop: 1:1 either way.
 *
 * `!important`, like the focus ring of a chart bound from the page, because
 * no specificity is enough to keep the two together. Pages do not name
 * fields by element type alone: Milligram clears only their background,
 * through `input[type='text']`, so a pair given one attribute above the
 * element-type resets met a rule of equal weight later in the page, lost its
 * background to it, and left black text on the dark backdrop. So the reader's
 * pair also replaces fields a page themes on purpose, by a class, an id or a
 * cascade layer, which is what the reader turned high contrast on for. A
 * page's own `!important` field colour still outweighs the rule, and there
 * `useReadableField` sets the reader's pair on the field itself, inline and
 * `!important`, however dim the reader chose it. Forced colours replace both
 * colours, as ever.
 *
 * With high contrast off nothing here applies: the fields keep the page's
 * colours, and `useReadableField` steps in only where those are unreadable.
 */
const FIELD_HIGH_CONTRAST_RULE = `
:where([style*="${Constant.HIGH_CONTRAST_LIGHT_PROPERTY}"]) :is(textarea[id^="${Constant.BRAILLE_TEXT_AREA}-"], input[id^="${Constant.REVIEW_INPUT}-"]) {
  color: var(${Constant.HIGH_CONTRAST_LIGHT_PROPERTY}) !important;
  background-color: var(${Constant.HIGH_CONTRAST_DARK_PROPERTY}) !important;
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
      ensureDocumentStyle(doc, 'data-maidr-fields', FIELD_HIGH_CONTRAST_RULE);
    }
  }, [figureRef]);

  // Compute the name and the initial instructions once, so a screen reader
  // can name the chart (role="img" + aria-label) and say how to use it
  // (aria-describedby) before any user interaction. `revision` is a
  // dependency because both are built from translated messages: it advances
  // on a language change and when the language's pack arrives, which leaves
  // `locale` itself unchanged.
  const chartName = useMemo(() => getChartName(data), [data, revision]);
  const initialInstruction = useMemo(() => getInitialInstruction(data), [data, revision]);
  const initialDescription = useMemo(
    () => withKeyboardHelp(initialInstruction),
    [initialInstruction, revision],
  );
  const instructionId = initialInstructionId(data.id);

  // A chart whose data or language changes while the reader is not in it is
  // described by what it is now. The Office pane's picker swaps one chart for
  // another under the same figure id, and the element DisplayService described
  // the plot by when the reader left holds the old chart's instructions, for a
  // place useMaidrController forgets on new data.
  useLayoutEffect(() => {
    const plot = plotRef.current;
    if (plot === null || figureRef.current?.contains(plot.ownerDocument.activeElement)) {
      return;
    }
    describeWithInstruction(plot, [instructionId, currentInstructionId(data.id)], instructionId);
  }, [data, initialDescription, instructionId, plotRef, figureRef]);

  // A sighted reader with a mouse learns from a tooltip that the chart is
  // clicked to be used, and how to use it (#244). The tooltip is the
  // instructions the plot is described by. So it is the plot's title only
  // while a mouse is over a chart not in use: a screen reader, which reads
  // the instructions as the description, never meets them as a title too.
  const [pointerHint, setPointerHint] = useState(false);
  const handlePointerEnter = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const figure = figureRef.current;
    if (event.pointerType !== 'touch' && !figure?.contains(figure.ownerDocument.activeElement)) {
      setPointerHint(true);
    }
  }, [figureRef]);
  const handlePointerLeave = useCallback(() => setPointerHint(false), []);
  const handleFocusIn = useCallback(() => {
    setPointerHint(false);
    onFocusIn();
  }, [onFocusIn]);

  // Click-to-activate shim: most chart libraries render the plot as inert SVG
  // children of our `tabIndex={0}` wrapper. Browsers do NOT auto-focus a
  // tabbable ancestor when one of its children is clicked, so without this
  // handler MAIDR only activates via the Tab key. We focus the wrapper on
  // pointer-down (matching how the SVG-based adapters behave) only when focus
  // isn't already inside it, to avoid stealing focus from inner interactive
  // elements (e.g. tooltips, chart UI buttons).
  const handlePointerDown = useCallback((_event: ReactPointerEvent<HTMLDivElement>) => {
    setPointerHint(false);
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
        onFocus={handleFocusIn}
        onBlur={onFocusOut}
      >
        <div
          ref={plotRef}
          tabIndex={0}
          role="img"
          aria-label={chartName}
          aria-describedby={instructionId}
          title={pointerHint ? initialDescription : undefined}
          style={{ width: 'fit-content' }}
          onPointerDown={handlePointerDown}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        >
          {children}
        </div>
        {/* The instructions the plot is described by until it is first
            focused; DisplayService describes it from an element of its own
            after that. Hidden: read only as the plot's description. */}
        <div id={instructionId} hidden>{initialDescription}</div>
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
