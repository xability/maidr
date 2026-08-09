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
  [TraceType.BAR]: true,
  [TraceType.BOX]: true,
  [TraceType.CANDLESTICK]: true,
  // Built at runtime from a candlestick and a reference line, never declared
  // in the JSON; it is navigated by field and candle, not by an orientation.
  [TraceType.CANDLESTICK_DELTA]: false,
  [TraceType.DODGED]: true,
  [TraceType.HEATMAP]: false,
  [TraceType.HISTOGRAM]: true,
  [TraceType.LINE]: false,
  [TraceType.NORMALIZED]: true,
  // Slices are arranged around a circle, not along an axis: there is no
  // orientation to declare and none to fall back to.
  [TraceType.PIE]: false,
  [TraceType.SCATTER]: false,
  [TraceType.SMOOTH]: false,
  [TraceType.STACKED]: true,
  [TraceType.STEP]: false,
  [TraceType.VIOLIN_BOX]: true,
  [TraceType.VIOLIN_KDE]: true,
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
