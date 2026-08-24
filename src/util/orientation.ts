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
 *
 * This is not the question of what `orientation` does to a layer's *data*.
 * A type marked true here may or may not want its `x` and `y` exchanged when
 * it is drawn horizontally: the bar family does, and everything else does
 * not. That table lives on {@link MaidrLayer.orientation}, because the party
 * that needs it is whoever is writing the JSON. Reading this record as though
 * it answered that is how two bindings came to emit a horizontal bar with a
 * category name where the magnitude belongs.
 */
const IS_ORIENTED: Record<TraceType, boolean> = {
  // An area trace is a line with a fill, and it is navigated as one: along
  // the series, then between series. Which way the band is drawn changes
  // nothing about that, so — as with LINE, STEP and SMOOTH — there is no
  // orientation to announce. The stacked variants inherit the same reading.
  [TraceType.AREA]: false,
  [TraceType.BAR]: true,
  [TraceType.BOX]: true,
  // The distributions run along one axis and their quantiles along the other,
  // so which axis a rung's value lies on depends on which way the chart was
  // drawn -- the same answer a box plot gives, for the same reason.
  [TraceType.BOXEN]: true,
  // Flow runs from source to sink whichever way the ribbons are laid out, and
  // a chord diagram has no axes at all.
  [TraceType.ALLUVIAL]: false,
  [TraceType.CHORD]: false,
  [TraceType.SANKEY]: false,
  // A force layout has no axes at all, and where a node lands carries no
  // meaning to swap.
  [TraceType.NETWORK]: false,
  [TraceType.CANDLESTICK]: true,
  // Built at runtime from a candlestick and a reference line, never declared
  // in the JSON; it is navigated by field and candle, not by an orientation.
  [TraceType.CANDLESTICK_DELTA]: false,
  // Competitors are the rows and periods the columns whichever way the chart
  // is drawn, so there is no main and cross axis to swap -- the answer a line
  // already gives.
  [TraceType.BUMP]: false,
  // A population pyramid is drawn with its categories running down the page
  // and a Likert chart with them across it, and the sides grow along the
  // other axis either way -- so which axis a bar's length lies on depends on
  // which way it was drawn, exactly as it does for the stacked bar this
  // extends.
  // Two continuous axes with the field over them, so there is no main and
  // cross axis to swap -- the answer a line already gives, and a contour is
  // one curve per level.
  // North is north. There is no reading of a map in which the compass is
  // swapped for its transpose.
  [TraceType.CHOROPLETH]: false,
  [TraceType.CONTOUR]: false,
  [TraceType.DIVERGING]: true,
  [TraceType.DODGED]: true,
  // A bar chart's reading with a different mark, and a bar is oriented -- a
  // Cleveland dot plot is conventionally drawn with its categories down the
  // page, which is the case this exists to get right.
  [TraceType.DOT]: true,
  // The interval runs along the value axis and the samples along the other,
  // so which way round they are drawn decides which axis a bound moves on --
  // the same reason a bar or a box is oriented.
  [TraceType.DUMBBELL]: true,
  [TraceType.ERROR_BAR]: true,
  // Lanes run one way and the axis the other, so which way round they are
  // drawn decides which axis an interval's ends move on -- the same reason a
  // bar or a box is oriented. A timeline drawn down the page is the ordinary
  // alternative, not an exotic one.
  // A forest plot is conventionally drawn with its studies down the page and
  // the effect axis across it, which is the arrangement this exists to get
  // right -- the same reason the error bar it extends is oriented.
  [TraceType.FOREST]: true,
  [TraceType.GANTT]: true,
  // A funnel is drawn top to bottom as often as left to right, and the stages
  // run along one axis with the counts on the other either way -- so which
  // axis a bar's length lies on depends on how it was drawn, exactly as it
  // does for the bar chart this extends.
  [TraceType.FUNNEL]: true,
  // One measure on a dial. There is no second axis for it to be read against,
  // so there is nothing an orientation could swap.
  [TraceType.GAUGE]: false,
  [TraceType.HEATMAP]: false,
  // A lattice of bins over two continuous axes, navigated by row and bin
  // whichever way round the axes are -- the same answer a heatmap gives.
  [TraceType.HEXBIN]: false,
  [TraceType.HISTOGRAM]: true,
  [TraceType.LINE]: false,
  // A bar's reading with a different mark, so oriented for the reason DOT is.
  [TraceType.LOLLIPOP]: true,
  // A mosaic is drawn with its categories across the page or down it, and
  // the segments run along the other axis either way -- the same reason the
  // stacked bar it extends is oriented.
  [TraceType.MOSAIC]: true,
  [TraceType.NORMALIZED]: true,
  [TraceType.NORMALIZED_AREA]: false,
  // The axes are the columns and the observations the rows, whichever way the
  // axes are drawn -- a horizontal parallel coordinates plot still walks the
  // same grid. There is no main and cross axis to swap, because every column
  // is its own axis.
  [TraceType.PARALLEL]: false,
  // Slices are arranged around a circle, not along an axis: there is no
  // orientation to declare and none to fall back to.
  [TraceType.PIE]: false,
  // Spokes sit around a circle rather than along an axis, so there is no main
  // and cross axis to swap -- the same answer a pie gives.
  [TraceType.POLAR_AREA]: false,
  [TraceType.RADAR]: false,
  // The groups run one way and the value axis the other, and a ridgeline is
  // drawn with its groups down the page as often as across it -- but the
  // trace reads the same either way round, so there is nothing for the key to
  // change and no orientation to announce. `RidgelineTrace` extends
  // `AbstractTrace` rather than `ViolinTrace`, so it neither resolves
  // `layer.orientation` nor inherits anything that does: this entry was `true`
  // by analogy with the violin it shares a point shape with, and the analogy
  // does not reach the class where that handling lives (#949). The answer
  // WATERFALL gives, for the same reason.
  [TraceType.RIDGELINE]: false,
  // Two continuous axes, so there is no main and cross axis to swap -- the
  // answer a scatter already gives, and both of these are scatters.
  [TraceType.MANHATTAN]: false,
  [TraceType.VOLCANO]: false,
  [TraceType.SCATTER]: false,
  [TraceType.SMOOTH]: false,
  [TraceType.STACKED]: true,
  [TraceType.STACKED_AREA]: false,
  [TraceType.STEP]: false,
  // Time runs one way and survival the other whichever way it is drawn, so
  // there is no main and cross axis to swap -- the answer a step chart
  // already gives, and this is one.
  [TraceType.SURVIVAL]: false,
  // A tree has no axis to run along: a node sits inside its parent, and
  // there is no reading of the chart in which that is drawn sideways.
  [TraceType.ICICLE]: false,
  [TraceType.SUNBURST]: false,
  [TraceType.TREE]: false,
  [TraceType.PACK]: false,
  [TraceType.TREEMAP]: false,
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
