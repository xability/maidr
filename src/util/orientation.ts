import { Orientation, TraceType } from '@type/grammar';

/**
 * Whether each trace type's model navigates along an orientation.
 *
 * A type marked true resolves `layer.orientation` to a concrete
 * {@link Orientation} at construction — falling back to
 * {@link Orientation.VERTICAL} when the MAIDR JSON omits it — and swaps its
 * main and cross axes accordingly. Orientation is therefore never unknown for
 * those types, only undeclared, which is why {@link resolveOrientation} can
 * report it for every one of them.
 *
 * A type marked false has no orientation at all: a scatter, heatmap, line,
 * step, or smooth trace reads the same way whichever way it is drawn.
 *
 * Keyed by every {@link TraceType} so a new trace type cannot be added without
 * answering the question here — the same reason `CHART_TYPE_LABEL` in
 * `src/model/abstract.ts` is a full record rather than a partial one.
 */
const IS_ORIENTED: Record<TraceType, boolean> = {
  // An area trace is a line with a fill, and it is navigated as one: along
  // the series, then between series. Which way the band is drawn changes
  // nothing about that, so — as with LINE, STEP and SMOOTH — there is no
  // orientation to announce. The stacked variants inherit the same reading.
  [TraceType.AREA]: false,
  [TraceType.BAR]: true,
  [TraceType.BOX]: true,
  [TraceType.CANDLESTICK]: true,
  // Built at runtime from a candlestick and a reference line, never declared
  // in the JSON; it is navigated by field and candle, not by an orientation.
  [TraceType.CANDLESTICK_DELTA]: false,
  [TraceType.DODGED]: true,
  // The interval runs along the value axis and the samples along the other,
  // so which way round they are drawn decides which axis a bound moves on --
  // the same reason a bar or a box is oriented.
  [TraceType.ERROR_BAR]: true,
  // One measure on a dial. There is no second axis for it to be read against,
  // so there is nothing an orientation could swap.
  [TraceType.GAUGE]: false,
  [TraceType.HEATMAP]: false,
  [TraceType.HISTOGRAM]: true,
  [TraceType.LINE]: false,
  [TraceType.NORMALIZED]: true,
  [TraceType.NORMALIZED_AREA]: false,
  // Slices are arranged around a circle, not along an axis: there is no
  // orientation to declare and none to fall back to.
  [TraceType.PIE]: false,
  [TraceType.SCATTER]: false,
  [TraceType.SMOOTH]: false,
  [TraceType.STACKED]: true,
  [TraceType.STACKED_AREA]: false,
  [TraceType.STEP]: false,
  [TraceType.VIOLIN_BOX]: true,
  [TraceType.VIOLIN_KDE]: true,
  // The steps run along the category axis and the contributions along the
  // value axis, but the trace reads the same either way round: navigation is
  // one column per step in both, and a horizontal waterfall swaps nothing a
  // reader would hear. As with LINE and STEP, there is no orientation to
  // announce.
  [TraceType.WATERFALL]: false,
  // Terms are packed into a rectangle, not laid along an axis, and the trace
  // walks them by weight rather than by position. There is no main and cross
  // axis to swap, the same as a pie.
  [TraceType.WORD_CLOUD]: false,
};

/**
 * Resolves the orientation a trace is actually navigated by.
 *
 * Mirrors what the trace constructors do — `layer.orientation ?? VERTICAL` —
 * so the announcement matches the model's behaviour rather than the presence
 * of a key in the JSON. A bar chart whose layer omits `orientation` is
 * navigated as a vertical bar chart, so it is announced as one.
 *
 * `traceType` is a plain string rather than a `TraceType`: the pre-activation
 * builder in `maidr-component.tsx` reads it straight off the JSON, where an
 * absent or unknown type is possible, and an unknown type simply has no
 * orientation.
 *
 * @param traceType - The layer's `type`, as declared in the MAIDR JSON
 * @param declared - The layer's `orientation`, when the JSON declares one
 * @returns The effective orientation, or undefined for types that have none
 */
export function resolveOrientation(
  traceType: string,
  declared?: Orientation,
): Orientation | undefined {
  if (!IS_ORIENTED[traceType as TraceType]) {
    return undefined;
  }
  return declared === Orientation.HORIZONTAL
    ? Orientation.HORIZONTAL
    : Orientation.VERTICAL;
}

/**
 * Builds a human-readable plot type string with optional orientation prefix.
 * Returns just the type when there is no orientation (no extra whitespace).
 *
 * Takes the resolved orientation, not the raw layer field — pass
 * {@link resolveOrientation}'s result so an undeclared orientation still
 * announces the one the trace is navigated by.
 *
 * @param plotType - The display name of the plot type, e.g. `bar`
 * @param orientation - The orientation to prefix with, when there is one
 * @returns The plot type, prefixed with `vertical` or `horizontal` when known
 */
export function formatPlotType(
  plotType: string,
  orientation?: Orientation,
): string {
  if (!orientation) {
    return plotType;
  }
  return orientation === Orientation.HORIZONTAL
    ? `horizontal ${plotType}`
    : `vertical ${plotType}`;
}
