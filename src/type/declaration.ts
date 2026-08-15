/**
 * The co-located `maidr` declaration — what a chart says about itself.
 *
 * A charting library draws marks. It does not say what they *mean*: nothing in
 * a Highcharts `line` series says the step is a survival curve, and nothing in
 * a Chart.js scatter says a column of the data is a gene name. Where that
 * meaning cannot be recovered from the drawing, the author declares it, in one
 * block written beside the series they already wrote.
 *
 * ## Where the block goes
 *
 * Always in the charting library's **own documented pass-through slot**, under
 * the key `maidr` — never as an invented top-level key on an object the
 * library owns:
 *
 * | library    | write site                     |
 * |------------|--------------------------------|
 * | Highcharts | `series.custom.maidr`          |
 * | amCharts   | `series.set('userData', { maidr })` |
 * | Chart.js   | `dataset.maidr`                |
 * | Plotly     | `trace.meta.maidr`             |
 * | Vega-Lite  | `usermeta.maidr` on the unit or layer child spec |
 *
 * Recharts declares through its own `chartType` plus `*Config` props, and d3
 * declares by which `bindD3*` binder is called; neither reads this block.
 *
 * ## The two laws that decide how a field is written
 *
 * 1. **If a fact differs per point, the declaration names a data field — a
 *    {@link FieldRef}, the name of a property on your own row objects. If a
 *    fact is the same for the whole layer, the declaration carries the value
 *    itself.** So `weight` is a field name and `nullValue` is a number.
 * 2. **Every field here is spelled exactly like the grammar field it fills,
 *    and every {@link FieldRef} defaults to that same name.** An author who
 *    has read `ForestPoint.weight` in `grammar.ts` knows what to write, and a
 *    row that already carries a `weight` column needs no declaration at all.
 *
 * A `FieldRef` that is left out falls back to its canonical name and then to a
 * short list of common spellings of it (`ciLower` for `yMin`, `isCensored`
 * for `censored`); a `FieldRef` that is given is used verbatim, because an
 * explicit name that misses is a mistake worth reporting rather than papering
 * over. The fallback lists live in `src/adapters/shared/traceDeclaration.ts`
 * so a column that works in one adapter reading this block works in all of
 * them. Most are shared by canonical name across the variants; a few belong to
 * one chart, because the same name means different things on different ones —
 * see {@link ChoroplethDeclaration.value}.
 *
 * A name is resolved against the row itself and against the row's
 * `properties`, in that order, and a dotted name walks the path it spells. A
 * GeoJSON feature keeps everything joined onto it one level down, so a map
 * needs no declaration to say so.
 *
 * ## What a declaration is worth
 *
 * A declaration outranks every heuristic an adapter has, and a declaration
 * that cannot be honoured degrades to a **truthful smaller** reading — the
 * layer is emitted without the option block it could not fill — never to a
 * confident wrong one. Nothing here is ever guessed: the four values that
 * would invert a reading if guessed wrong ({@link ManhattanDeclaration.significance},
 * {@link ManhattanDeclaration.significanceDirection},
 * {@link ManhattanDeclaration.effect} and {@link ForestDeclaration.nullValue})
 * have no defaults at all.
 *
 * These are input types, authored by whoever draws the chart, exactly as
 * `grammar.ts` is. They are read by chart authors, not only by contributors.
 */

import type { Orientation, StepDirection, TraceType } from './grammar';

/**
 * The name of a property on the author's own datum/row object.
 *
 * Never a function: a declaration must survive JSON, because four of the slots
 * it rides in are serialised chart config and a function cannot be written in
 * one. d3 keeps its `DataAccessor<T>` (`string | function`) and accepts a bare
 * `FieldRef` wherever this file names one.
 *
 * The name is resolved against the row the charting library bound to the mark
 * — a Chart.js datum, a Highcharts `point.options`, an amCharts
 * `dataItem.dataContext` — so it is the column name in your data, not a label
 * on the chart.
 *
 * @example
 * // rows are { time: 4, surv: 0.8, isCensored: true }
 * { type: TraceType.SURVIVAL, censored: 'isCensored' }
 */
export type FieldRef = string;

/**
 * A library-native identifier for another series in the same chart —
 * Highcharts `series.options.id`, amCharts `IEntitySettings.id`, Chart.js
 * `dataset.label`, Recharts `dataKey`.
 *
 * **Never an index.** Positional addressing into a series list goes stale the
 * moment a series is filtered, reordered or toggled — a routine chart edit
 * nobody associates with accessibility — and that is the failure this design
 * exists to remove.
 *
 * A ref that names no series is reported and the parent layer is emitted
 * without that half, rather than silently matching whatever sits at that
 * position today.
 */
export type SeriesRef = string;

/** Fields every declaration accepts, whatever its `type`. */
export interface DeclarationBase {
  /**
   * Overrides the layer's announced title. Maps to `MaidrLayer.title`.
   *
   * Names the *chart*; use {@link DeclarationBase.name} to say which layer of
   * it this is.
   */
  title?: string;
  /**
   * Names this layer among sibling layers. Maps to `MaidrLayer.name`.
   *
   * Announced on a layer switch in place of the trace type, so a hue-split
   * figure says "Male" and "Female" rather than "error_bar plot" twice.
   */
  name?: string;
}

/**
 * A declaration of what one series means, discriminated on its `type`.
 *
 * `type` is the **`TraceType` string value**, not a private alias: the word
 * the author writes is the word emitted in `MaidrLayer.type` and printed in
 * every warning. Two of them surprise people and are called out on the fields
 * that carry them — `TraceType.SCATTER` is `'point'` and `TraceType.PARALLEL`
 * is `'parallel_coordinates'`.
 *
 * The key set of each variant is **closed**, and adapters check it at read
 * time — the key names, the shape of each value, and the presence of the few
 * fields a variant cannot be read without. A plain-JS author who writes
 * `significanse: 7.3`, or `significanceDirection: 'Below'`, is told so, which
 * is the only defence available outside TypeScript. A value that is not what
 * its key takes is dropped rather than passed on, so the grammar's own default
 * applies instead of a wrong reading.
 */
export type MaidrTraceDeclaration
  = | SurvivalDeclaration
    | ErrorBarDeclaration
    | ForestDeclaration
    | VolcanoDeclaration
    | ManhattanDeclaration
    | AlluvialDeclaration
    | MosaicDeclaration
    | ScatterDeclaration
    | ChoroplethDeclaration
    | ParallelDeclaration
    | RidgelineDeclaration
    | HexbinDeclaration
    | BoxenDeclaration
    | GanttDeclaration;

/**
 * A Kaplan-Meier survival curve drawn as a step line.
 *
 * What a survival figure carries beyond a step chart is the two things it is
 * read for: which times were **censored**, and how wide the **confidence
 * band** is. Censoring marks are drawn as ticks rather than as steps, and a
 * reader who cannot tell a censored time from an ordinary one cannot tell a
 * flat tail backed by two hundred subjects from one backed by three.
 *
 * @example
 * // Highcharts, one arm whose own samples carry the flag
 * { custom: { maidr: { type: 'survival', censored: 'cens' } } }
 */
export interface SurvivalDeclaration extends DeclarationBase {
  /** `TraceType.SURVIVAL` — the string `'survival'`. */
  type: TraceType.SURVIVAL;
  /**
   * Field marking a sample as a censored time. Maps to `SurvivalPoint.censored`.
   *
   * `true`, `1`, `'1'` and `'true'` count as censored; anything else does
   * not — the flag arrives as a boolean, as a 0/1 indicator or as the string
   * one of those was parsed from, and `'0'` is truthy in every one of those
   * readings but censors nobody. The same table decides
   * {@link ForestDeclaration.pooled}.
   *
   * Deliberately **not** aliased to `event`, which most survival datasets
   * carry with the opposite meaning: a 1 there is the event happening, which
   * is exactly the times that are not censored.
   *
   * @default 'censored', falling back to `censor` or `isCensored`
   */
  censored?: FieldRef;
  /**
   * Field holding the confidence band's lower bound at this time. Maps to
   * `SurvivalPoint.yMin`.
   *
   * @default 'yMin', falling back to `lower`, `lo`, `ciLower`, `ciLow`,
   * `ci_low`, `low` or `min`
   */
  yMin?: FieldRef;
  /**
   * Field holding the confidence band's upper bound at this time. Maps to
   * `SurvivalPoint.yMax`.
   *
   * @default 'yMax', falling back to `upper`, `hi`, `ciUpper`, `ciHigh`,
   * `ci_high`, `high` or `max`
   */
  yMax?: FieldRef;
  /**
   * Where the curve jumps between times. Maps to `MaidrLayer.stepDirection`.
   *
   * `'hv'` is what a Kaplan-Meier curve means — survival holds until an event
   * drops it — but MAIDR substitutes no default of its own, so declare it
   * rather than letting the description stay silent about the convention.
   */
  stepDirection?: StepDirection;
  /**
   * Companion series drawing the censoring ticks, when they come from their
   * own data join rather than from a `censored` column on the curve.
   *
   * Each tick is merged into this layer at the time its x gives, and the
   * companion is suppressed from becoming a layer of its own. Highcharts
   * charts that already pair with `linkedTo` need not repeat themselves here.
   */
  censoredSeries?: SeriesRef;
  /** Companion series drawing the confidence band, merged in by x as above. */
  bandSeries?: SeriesRef;
  /**
   * Absorb *following* sibling series of the same drawn kind into this layer
   * as further **arms** of the same curve, as
   * {@link ManhattanDeclaration.merge} absorbs further points into one cloud.
   *
   * On by default, because a survival figure is one figure whose arms belong
   * together: treated and control are read against each other, and two arms
   * split into two layers is a reader switching layers to compare the two
   * numbers the chart exists to compare. `SurvivalTrace` carries an arm per
   * row, so the arms stay individually navigable either way.
   *
   * Set `false` for the rare figure whose curves are genuinely separate
   * charts. A second arm needs no declaration block of its own.
   *
   * @default true
   */
  merge?: boolean;
}

/**
 * An estimate with the interval drawn around it — an error bar, a confidence
 * interval, a point range.
 *
 * The bounds are **absolute positions** on the value axis, never offsets from
 * the estimate. Producers disagree about which they hand out (matplotlib's
 * `yerr` is an offset, Vega-Lite's `errorbar` computes bounds), so the grammar
 * fixes one and {@link ErrorBarDeclaration.error} is how the other is
 * declared and converted.
 *
 * The two bounds are optional and independently so: a one-sided interval is a
 * real chart, and dropping the point for want of its other half would lose the
 * estimate too.
 */
export interface ErrorBarDeclaration extends DeclarationBase {
  /** `TraceType.ERROR_BAR` — the string `'error_bar'`. */
  type: TraceType.ERROR_BAR;
  /**
   * Field holding the **absolute** lower bound. Maps to `ErrorBarPoint.yMin`.
   *
   * @default 'yMin', falling back to `lower`, `lo`, `ciLower`, `ciLow`,
   * `ci_low`, `low` or `min`
   */
  yMin?: FieldRef;
  /**
   * Field holding the **absolute** upper bound. Maps to `ErrorBarPoint.yMax`.
   *
   * @default 'yMax', falling back to `upper`, `hi`, `ciUpper`, `ciHigh`,
   * `ci_high`, `high` or `max`
   */
  yMax?: FieldRef;
  /**
   * Field holding the interval as an **offset** from the estimate — the field
   * a Recharts `<ErrorBar dataKey>` or a matplotlib `yerr` points at. A number
   * is a symmetric offset; a `[lower, upper]` pair is an asymmetric one.
   *
   * Both forms are **positive magnitudes**, as `yerr` is: the bounds are
   * `estimate - lower` and `estimate + upper`, so an interval given as
   * `[0.2, 0.3]` around 1.4 is 1.2 to 1.7. Signed offsets are not a second
   * accepted spelling — read that way the same pair would give 1.6 to 1.7, and
   * neither reading is detectable downstream once the absolute bounds are
   * emitted. A negative entry is left out rather than flipped.
   *
   * Normalised to absolute bounds on the way into the payload. Loses to
   * `yMin`/`yMax` where both are declared, since those need no arithmetic.
   *
   * Alone among the field refs here, this one has **no fallback chain**: an
   * offset column is named explicitly or spelled exactly `error`. Every common
   * spelling is either axis-specific (`yerr`, `xerr`, and a row carrying both
   * says nothing about which axis this chart draws its intervals on) or a
   * dispersion statistic a chart commonly draws a multiple of (`sd`, `sem`,
   * `err` — ±1.96 SEM is as ordinary as ±1). Read as the drawn offset, one of
   * those resizes every interval on the figure without saying so.
   */
  error?: FieldRef;
  /**
   * Companion series drawing the interval rather than the estimate — an
   * amCharts `openValueY`/`openValueX` column, a Highcharts `errorbar`.
   *
   * Merged into this layer by x and suppressed from becoming a layer of its
   * own.
   */
  intervalSeries?: SeriesRef;
  /**
   * Which axis the estimate runs along. Maps to `MaidrLayer.orientation`.
   *
   * The `Orientation` values, which are **`'horz'` and `'vert'`** — not the
   * words they abbreviate. `'horizontal'` is not accepted, and a declaration
   * carrying it is warned about and read without the key.
   */
  orientation?: Orientation;
}

/**
 * One effect estimate with its interval per study, against a shared null line,
 * with a pooled summary at the foot — the standard figure of a meta-analysis.
 *
 * It *is* an {@link ErrorBarDeclaration} laid out on a categorical row axis,
 * so it accepts every field one does. What it adds is the part a sighted
 * reader takes from the drawing and is otherwise never told: how much each
 * study weighs, which row is the pooled result rather than evidence, and where
 * the null line sits.
 */
export interface ForestDeclaration extends Omit<ErrorBarDeclaration, 'type'> {
  /** `TraceType.FOREST` — the string `'forest'`. */
  type: TraceType.FOREST;
  /**
   * Field holding the study's weight in the pooled estimate, as a fraction of
   * one. Maps to `ForestPoint.weight`.
   *
   * A forest plot encodes this as marker *area*: two studies whose intervals
   * look alike can contribute wholly differently to the result. Omitted from
   * the payload when nothing resolves — a forest plot without weights is a
   * real chart.
   *
   * A **fraction of one**, not a percentage. Meta-analysis software reports
   * this column as a percentage — `12.5` for one study in eight — and that is
   * the number the default chain will find. A resolved weight above 1 is left
   * out rather than rescaled: dividing by 100 guesses that the column sums to
   * 100, and announcing it untouched says "weight 1250%".
   *
   * @default 'weight', falling back to `w` or `share`
   */
  weight?: FieldRef;
  /**
   * Field marking a row as the pooled summary rather than a study. Maps to
   * `ForestPoint.pooled`.
   *
   * It is a different kind of row — it is not evidence, it is what the
   * evidence came to — and announcing it as one more study invites a reader to
   * count it among them.
   *
   * Read on the same strict table as
   * {@link SurvivalDeclaration.censored}: `true`, `1`, `'1'` and `'true'` mark
   * the pooled row and nothing else does. Read by truthiness instead, a CSV's
   * `'0'` marks every study as the summary and empties the evidence the trace
   * counts and compares.
   *
   * @default 'pooled', falling back to `isPooled` or `summary`
   */
  pooled?: FieldRef;
  /**
   * Row index of the pooled summary, for data that carries no flag column. A
   * meta-analysis draws the pooled row last, so this is usually the last
   * index.
   *
   * Counts **the declaring series' own rows, as authored**, from zero —
   * including any row an adapter goes on to drop for want of a finite value,
   * since that is the only sequence an author can see. It is resolved before
   * any {@link ForestDeclaration.pooledSeries} is absorbed, so it never
   * addresses a row that arrived from the companion.
   */
  pooledIndex?: number;
  /**
   * Companion series drawing the pooled summary's own mark — the diamond a
   * meta-analysis ends with, when it is drawn differently from the studies.
   *
   * Its rows are appended after the studies and the companion is suppressed
   * from becoming a layer of its own.
   */
  pooledSeries?: SeriesRef;
  /**
   * The value that means "no effect" — 1 for a ratio measure, 0 for a
   * difference. Maps to `MaidrLayer.forestOptions.nullValue`.
   *
   * Whether a study's interval crosses it *is the result for that study*, so
   * the trace announces the crossing. There is deliberately **no default**: a
   * ratio chart guessed at 0 would report every study as not crossing, since
   * odds ratios are all positive, and that is a confident wrong answer given
   * to every row. Undeclared, the layer gets the estimate, the interval and
   * the weight, and makes no claim about significance.
   */
  nullValue?: number;
}

/**
 * Genomic position against significance — the standard figure of a GWAS.
 *
 * Read as a scatter it offers point-by-point navigation over tens of thousands
 * of points, which is not a viable path to the few dozen that matter. What a
 * reader wants is which points cross the line and what they are called.
 *
 * @example
 * // Chart.js, 22 chromosome datasets that read as one cloud
 * { maidr: { type: 'manhattan', label: 'snp', group: 'chr', significance: 7.3 } }
 */
export interface ManhattanDeclaration extends DeclarationBase {
  /** `TraceType.MANHATTAN` — the string `'manhattan'`. */
  type: TraceType.MANHATTAN;
  /**
   * Field holding what each point *is* — a SNP id, a probe, a marker. Maps to
   * `VolcanoPoint.label`.
   *
   * Identity is the payload on these charts, not the coordinates: a reader
   * told "x is 2.3, y is 14.1" has been given the two numbers whose shape they
   * can already hear and withheld the one thing they came for. Left out of the
   * payload when nothing resolves.
   *
   * @default 'label', falling back to `snp`, `id`, `name`, `gene` or `probe`
   */
  label?: FieldRef;
  /**
   * Field holding the region a point belongs to — its chromosome. Maps to
   * `VolcanoPoint.group`.
   *
   * @default 'group', falling back to `chromosome`, `chrom`, `chr` or `region`
   */
  group?: FieldRef;
  /**
   * The significance cutoff on the y axis, on the axis the chart is drawn
   * against — 7.3 for genome-wide significance on a `-log10(p)` axis. Maps to
   * `MaidrLayer.thresholdOptions.significance`.
   *
   * There is deliberately **no default**: the conventions differ by field and
   * by software, and a guessed line would sort every point on the figure onto
   * the wrong side, silently. Undeclared, the trace simply reports no
   * findings.
   */
  significance?: number;
  /**
   * Which side of `significance` is the significant one. Maps to
   * `MaidrLayer.thresholdOptions.significanceDirection`.
   *
   * `'above'` suits the transformed axes these charts usually carry; a **raw p
   * axis runs the other way** and needs `'below'`, where a reading fixed to
   * `'above'` would select precisely the points that failed to reach
   * significance and announce them as the result.
   *
   * The grammar's `'above'` default is the grammar's to apply: pass your value
   * through or pass nothing.
   */
  significanceDirection?: 'above' | 'below';
  /**
   * The effect-size cutoff on the x axis, applied to its **magnitude**. Maps
   * to `MaidrLayer.thresholdOptions.effect`.
   *
   * Meaningful on a volcano, whose x is an effect size. A Manhattan's x is a
   * genomic position and its x-axis plot lines are chromosome dividers rather
   * than cutoffs, so this is never inferred for one — declare it or leave it
   * out.
   */
  effect?: number;
  /**
   * Absorb *following* sibling series of the same drawn kind that carry no
   * declaration of their own into this layer.
   *
   * This is how a 22-dataset Manhattan becomes one navigable trace rather than
   * 22 layers a reader must switch between.
   *
   * @default true
   */
  merge?: boolean;
}

/**
 * Effect size against significance — the standard figure of a differential
 * expression analysis.
 *
 * The same chart as a {@link ManhattanDeclaration}, read the same way and
 * accepting the same fields: `label` names the gene the way it names the SNP,
 * and `significance` is the same cutoff on the same axis. What a volcano adds
 * is the **second** cutoff — its x is an effect size rather than a position,
 * so a point is a finding only when it clears both.
 */
export interface VolcanoDeclaration extends Omit<ManhattanDeclaration, 'type' | 'merge'> {
  /** `TraceType.VOLCANO` — the string `'volcano'`. */
  type: TraceType.VOLCANO;
  /**
   * Absorb following undeclared siblings of the same drawn kind, as
   * {@link ManhattanDeclaration.merge} does.
   *
   * Off by default, the other way round from a Manhattan: a volcano's sibling
   * series are usually up-regulated, down-regulated and unchanged — three
   * things a reader wants told apart, not one cloud.
   *
   * @default false
   */
  merge?: boolean;
}

/**
 * An ordinary scatter, declared rather than detected.
 *
 * Worth declaring for the two things a scatter cannot say for itself: that its
 * points carry an identity beyond their coordinates, and that several series
 * are one cloud.
 */
export interface ScatterDeclaration extends DeclarationBase {
  /**
   * `TraceType.SCATTER` — the string **`'point'`**, not `'scatter'`. The
   * grammar names the mark, and the value is what an adapter emits and what
   * every warning prints.
   */
  type: TraceType.SCATTER;
  /**
   * Field holding what each point *is*, announced alongside its coordinates
   * wherever the emitted point carries a name.
   *
   * `ScatterPoint` has no label field today, so a plain `point` layer has
   * nowhere to put one: declare `volcano` or `manhattan` where identity is the
   * payload, which is where the grammar carries it. The key is accepted here
   * rather than reported as unknown because it is the field's obvious home,
   * and warning about a spelling the declaration documents would send an
   * author looking for a typo they did not make.
   *
   * The default chain is the genomics one, so a row carrying an `id` or a
   * `name` column resolves to it. Where those are chart plumbing rather than
   * the point's identity, name the field explicitly.
   *
   * @default 'label', falling back to `snp`, `id`, `name`, `gene` or `probe`
   */
  label?: FieldRef;
  /**
   * Absorb following undeclared siblings of the same drawn kind into this
   * layer, as {@link ManhattanDeclaration.merge} does.
   *
   * @default false
   */
  merge?: boolean;
}

/**
 * Categories that stay put while a quantity is re-divided between them at each
 * step — an alluvial diagram.
 *
 * The same weighted flow a sankey carries, drawn without a left-to-right
 * budget, so it needs nothing declared beyond which of the two it is: the
 * nodes, the links and their magnitudes are already in the drawing.
 */
export interface AlluvialDeclaration extends DeclarationBase {
  /** `TraceType.ALLUVIAL` — the string `'alluvial'`. */
  type: TraceType.ALLUVIAL;
}

/**
 * A stacked bar chart whose bar **widths** also encode data — a mosaic or
 * marimekko, a two-way contingency table drawn as tiles.
 *
 * Read as a plain stacked bar it loses the width entirely, which is half the
 * table: the conditional proportions arrive without the group sizes they were
 * computed from, so a category of six people and one of six hundred read
 * identically.
 *
 * Always declared, never detected. A non-uniform width array on a stacked bar
 * is a claim about how authors behave, not about what the data means, and a
 * false positive would announce every column's width as a share of all
 * observations — a number the chart does not contain.
 */
export interface MosaicDeclaration extends DeclarationBase {
  /** `TraceType.MOSAIC` — the string `'mosaic'`. */
  type: TraceType.MOSAIC;
  /**
   * Field holding the category's share of all observations, as a fraction of
   * one — the width its column is drawn at. Maps to `MosaicPoint.width`.
   *
   * @default 'width'
   */
  width?: FieldRef;
  /**
   * Field holding the cell's own count, when the producer has the contingency
   * table. Maps to `MosaicPoint.count`.
   *
   * Optional because a producer working from proportions alone genuinely does
   * not have it, and multiplying out a rounded share would put a number in the
   * announcement that the data does not contain.
   *
   * @default 'count', falling back to `length`, `value`, `n` or `total`
   */
  count?: FieldRef;
}

/**
 * Geographic regions shaded by a value.
 *
 * Read as a bar chart whose categories happen to be places, it loses
 * everything spatial: where the high values sit, which way the gradient runs,
 * and which borders the value jumps across. `lon`/`lat` are what buy that
 * back.
 */
export interface ChoroplethDeclaration extends DeclarationBase {
  /** `TraceType.CHOROPLETH` — the string `'choropleth'`. */
  type: TraceType.CHOROPLETH;
  /**
   * Field holding the region's name. Maps to `ChoroplethPoint.x`.
   *
   * The chain is a map's own, not the one every other declaration shares: the
   * names a place answers to on a GeoJSON or TopoJSON feature, ending in `x`
   * so the ordinary region table — `{ x: 'Texas', y: 12.4 }` — is read the
   * right way round. Resolved against the row **and** against its
   * `properties`, which is where a feature keeps everything joined onto it, so
   * `region: 'NAME'` finds `properties.NAME` without being spelled as a path.
   *
   * @default 'region', falling back to `name`, `NAME`, `name_long`, `admin`,
   * `state`, `id`, `label` or `x`
   */
  region?: FieldRef;
  /**
   * Field holding the value the region is shaded by. Maps to
   * `ChoroplethPoint.y`.
   *
   * A map's own chain, deliberately **not** the one
   * {@link RidgelineDeclaration.value} carries: `x` is a position on the value
   * axis of a ridgeline and the place's own name on a map, and announcing
   * "Texas" as the value of Texas is a wrong reading a listener cannot tell
   * from a right one. Read off the row's `properties` as well, exactly as
   * {@link ChoroplethDeclaration.region} is.
   *
   * @default 'value', falling back to `y`, `rate`, `density` or `count`
   */
  value?: FieldRef;
  /**
   * Field holding the region's centroid longitude, in **degrees east**. Maps
   * to `ChoroplethPoint.lon`.
   *
   * Degrees only. Projected or normalised coordinates must be **omitted**
   * rather than converted by guesswork: without the pair the map is read as a
   * region list in declared order, which is a poorer reading but the one the
   * data supports, while a wrong compass direction is a confident wrong
   * answer.
   *
   * @default 'lon', falling back to `longitude` or `long`
   */
  lon?: FieldRef;
  /**
   * Field holding the region's centroid latitude, in **degrees north**. Maps
   * to `ChoroplethPoint.lat`. Degrees only, exactly as
   * {@link ChoroplethDeclaration.lon}.
   *
   * @default 'lat', falling back to `latitude`
   */
  lat?: FieldRef;
}

/**
 * One polyline per observation across several axes, one axis per variable.
 *
 * Every column is a different quantity, so a value is pitched against its
 * **own** axis rather than against one range for the layer — which is why the
 * axes must be named and why they must be named in draw order.
 */
export interface ParallelDeclaration extends DeclarationBase {
  /**
   * `TraceType.PARALLEL` — the string **`'parallel_coordinates'`**, not
   * `'parallel'`.
   */
  type: TraceType.PARALLEL;
  /**
   * The axes, in the order they are drawn — which is the order a reader arrows
   * through them.
   *
   * Required, and required to be a list: nothing on the observation says it,
   * an object's key order is not an axis order and must never be used as one,
   * and a guessed order would announce the chart's columns in the wrong
   * places.
   *
   * A bare string names both the axis and the **raw, un-normalised** field on
   * the observation. The object form separates them, for a chart whose column
   * key is not what a reader should hear. Either way the field named is the
   * value *before* the chart scaled it to the axis: a trace derives each
   * column's own extent, so it must never see 0–1 values.
   *
   * @example
   * dimensions: ['mpg', 'hp', { label: 'Weight (lb)', key: 'wt' }]
   */
  dimensions: (string | { label?: string; key: FieldRef })[];
  /**
   * Field holding the observation's name, announced as its series name.
   *
   * The default chain is the genomics one, so a row carrying an `id` or a
   * `name` column resolves to it. Where that column is chart plumbing rather
   * than the observation's name, name the field explicitly.
   *
   * @default 'label', falling back to `snp`, `id`, `name`, `gene` or `probe`
   */
  label?: FieldRef;
}

/**
 * One density curve per group along a shared value axis, the curves offset
 * down the page so their shapes can be compared.
 *
 * The offset is presentation — it exists so the curves do not overlap
 * illegibly — so a layer carries each group's curve on its own terms and never
 * the baseline it was drawn from.
 */
export interface RidgelineDeclaration extends DeclarationBase {
  /** `TraceType.RIDGELINE` — the string `'ridgeline'`. */
  type: TraceType.RIDGELINE;
  /**
   * Field holding the group a curve belongs to — the row it is drawn on. Maps
   * to the categorical axis of `ViolinKdePoint`.
   *
   * Required, and therefore always used verbatim: without it there is nothing
   * to separate the curves by, and one ridgeline read as a single density is a
   * different chart.
   */
  group: FieldRef;
  /**
   * Field holding the position along the value axis. Maps to
   * `ViolinKdePoint.y`.
   *
   * @default 'value', falling back to `x`, `t` or `position`
   */
  value?: FieldRef;
  /**
   * Field holding the kernel-density value **before** the group's ridge offset
   * was added. Maps to `ViolinKdePoint.density`.
   *
   * Fed the drawn y instead, every group's loudness becomes a function of
   * where it was stacked and the lowest ridge is the loudest. Where this
   * resolves to nothing the reading is refused outright — an adapter warns and
   * falls back to the undeclared chart type rather than subtracting a guessed
   * baseline.
   *
   * @default 'density', falling back to `kde`, `width`, `p` or `estimate`
   */
  density?: FieldRef;
}

/**
 * Hexagonal binning: the standard answer to an overplotted scatter.
 *
 * A lattice of cells each carrying a count, with the one difference that
 * decides its navigation: a hex lattice staggers alternate rows, so a column
 * index does not identify a position and each bin carries its own centre.
 */
export interface HexbinDeclaration extends DeclarationBase {
  /** `TraceType.HEXBIN` — the string `'hexbin'`. */
  type: TraceType.HEXBIN;
  /**
   * Field holding the bin's centre along the x axis, in **data units**. Maps
   * to `HexbinPoint.x`.
   *
   * Screen coordinates would announce every bin's position in pixels.
   *
   * The chain is a hexbin's own: `x` names a bin centre here and a category, a
   * lane or a quantile on other charts, so no chain could be shared. It is the
   * shipped d3 hexbin binder's, which is where these bins are already read
   * from.
   *
   * @default 'x', falling back to `x0` or `cx`
   */
  x?: FieldRef;
  /**
   * Field holding the bin's centre along the y axis, in **data units**. Maps
   * to `HexbinPoint.y`.
   *
   * @default 'y', falling back to `y0` or `cy`
   */
  y?: FieldRef;
  /**
   * Field holding how many points fell in the bin. Maps to
   * `HexbinPoint.count`.
   *
   * The `length` fallback is what makes a d3-hexbin bin work untouched: its
   * bins are arrays of the points that fell in them.
   *
   * @default 'count', falling back to `length`, `value`, `n` or `total`
   */
  count?: FieldRef;
  /**
   * Field holding the lattice row a bin sits on, for data that names it.
   *
   * Omitted, rows are grouped by identical `y`, which is what a lattice
   * computed by the usual libraries produces.
   */
  row?: FieldRef;
}

/**
 * A letter-value plot: the box plot's five-number summary generalised to a
 * variable-depth ladder of quantiles.
 *
 * The ladder is precomputed outside the charting library, so the declaration
 * names the columns it was computed into. A box plot's summary is this shape
 * with exactly one rung, and that fixed depth is why a box plot cannot express
 * a boxen.
 */
export interface BoxenDeclaration extends DeclarationBase {
  /** `TraceType.BOXEN` — the string `'boxen'`. */
  type: TraceType.BOXEN;
  /**
   * Field holding the category this boxen summarises. Maps to `BoxenPoint.z`.
   *
   * @default 'x'
   */
  x?: FieldRef;
  /**
   * Field holding the middle of the distribution. Maps to
   * `BoxenPoint.median`.
   *
   * @default 'median', falling back to `q2`, `mid` or `y`
   */
  median?: FieldRef;
  /**
   * Field holding the rungs — the ladder of `{ p, lo, hi }` quantile pairs.
   * Maps to `BoxenPoint.levels`.
   *
   * The trace sorts them outward from the median rather than trusting the
   * order they arrive in.
   *
   * This names the *column*; the rungs inside it are not declared field by
   * field. A rung is read as a row of its own, so its three numbers answer to
   * the same spread of spellings a top-level field does: `p` also to `prob`,
   * `probability` or `depth`; `lo` to `lower`, `low`, `min` or `y0`; `hi` to
   * `upper`, `high`, `max` or `y1`.
   *
   * @default 'levels', falling back to `letterValues`, `letter_values`,
   * `quantiles` or `ladder`
   */
  levels?: FieldRef;
  /** Field holding the values below the deepest rung. Maps to `BoxenPoint.lowerOutliers`. */
  lowerOutliers?: FieldRef;
  /** Field holding the values above the deepest rung. Maps to `BoxenPoint.upperOutliers`. */
  upperOutliers?: FieldRef;
  /**
   * Which axis the distributions run along. Maps to `MaidrLayer.orientation`.
   *
   * The `Orientation` values, which are **`'horz'` and `'vert'`** — not the
   * words they abbreviate, exactly as {@link ErrorBarDeclaration.orientation}.
   */
  orientation?: Orientation;
}

/**
 * A schedule drawn as intervals along a shared axis — a gantt chart, a
 * timeline, a swimlane diagram.
 *
 * What separates this from a bar chart is that both coordinates are positions
 * on the same axis rather than a position and a magnitude. A bar has one
 * number and a baseline; an interval has two numbers and no baseline, and the
 * fact a reader is listening for — how *long* the interval is — is a
 * difference between them that has to be announced rather than heard as a
 * height.
 *
 * That difference is also why {@link GanttDeclaration.unit} matters more here
 * than a unit does elsewhere: no charting library carries what a step of the
 * axis is called, so without it a task is announced as "7 long" rather than
 * "7 days".
 *
 * The variant is the schema an adapter reads a schedule through; no adapter
 * reads a gantt block yet, so a chart declaring one today is read as the
 * undeclared chart and told so. Adoption is a per-adapter change.
 *
 * @example
 * // The block a Highcharts adapter reading schedules would take, on a series
 * // whose rows name their ends the ordinary way
 * { custom: { maidr: { type: 'gantt', x: 'resource', unit: 'days' } } }
 */
export interface GanttDeclaration extends DeclarationBase {
  /** `TraceType.GANTT` — the string `'gantt'`. */
  type: TraceType.GANTT;
  /**
   * Field holding the lane the interval belongs to — a task, a resource, a
   * phase. Maps to `GanttPoint.x`.
   *
   * A lane commonly holds several intervals, and grouping is by this field's
   * value, so a row that resolves nothing here is its own lane rather than
   * joining another.
   *
   * @default 'x', falling back to `lane`, `category`, `label`, `name`, `key`,
   * `group` or `task`
   */
  x?: FieldRef;
  /**
   * Field holding where the interval begins. Maps to `GanttPoint.start`.
   *
   * @default 'start', falling back to `from`, `begin`, `x0` or `startDate`
   */
  start?: FieldRef;
  /**
   * Field holding where the interval ends. Maps to `GanttPoint.end`.
   *
   * @default 'end', falling back to `to`, `finish`, `x1` or `endDate`
   */
  end?: FieldRef;
  /**
   * Field holding what this interval is called, when the lane is not already
   * its name. Maps to `GanttPoint.label`.
   *
   * The chain is a schedule's own rather than the `label` chain every other
   * declaration shares, which is the Manhattan identifier's (`snp`, `gene`,
   * `probe`) and names nothing on a schedule.
   *
   * The `x` chain includes `label`, so a row that names its interval but not
   * its lane resolves both fields to the same word. An adapter adopting this
   * declaration should drop a label equal to the lane it sits in rather than
   * emit it — an interval labelled with its own lane says the same thing
   * twice. {@link resolveFieldRef} resolves the two names independently and
   * does not compare them, so the drop belongs to the adopting adapter.
   *
   * @default 'label', falling back to `name`, `task`, `title` or `activity`
   */
  label?: FieldRef;
  /**
   * What a unit of the axis is called: `'days'`, `'hours'`, `'weeks'`. Maps to
   * `GanttData.unit`.
   *
   * A literal word, not a field: the unit belongs to the chart and not to any
   * row, and a per-row unit would let a producer emit intervals that disagree
   * about what their numbers measure. Omitted, the trace announces a length
   * without a unit rather than guessing one.
   */
  unit?: string;
}
