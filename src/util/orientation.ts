import { Orientation, TraceType } from '@type/grammar';

/**
 * Trace types whose model navigates along an orientation.
 *
 * Every trace in this set resolves `layer.orientation` to a concrete
 * {@link Orientation} at construction — falling back to
 * {@link Orientation.VERTICAL} when the MAIDR JSON omits it — and swaps its
 * main and cross axes accordingly. Orientation is therefore never unknown for
 * these types, only undeclared, which is why {@link resolveOrientation} can
 * report it for every one of them.
 *
 * Types that are absent here have no orientation at all: a scatter, heatmap,
 * line, step, or smooth trace reads the same way whichever way it is drawn.
 */
const ORIENTED_TRACE_TYPES: ReadonlySet<string> = new Set<string>([
  TraceType.BAR,
  TraceType.BOX,
  TraceType.CANDLESTICK,
  TraceType.DODGED,
  TraceType.HISTOGRAM,
  TraceType.NORMALIZED,
  TraceType.STACKED,
  TraceType.VIOLIN_BOX,
  TraceType.VIOLIN_KDE,
]);

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
  if (!ORIENTED_TRACE_TYPES.has(traceType)) {
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
