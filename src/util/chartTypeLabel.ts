import type { MaidrLayer } from '@type/grammar';
import type { ChartGuide } from '@type/state';
import type { MessageKey } from '@util/i18n';
import { TraceType } from '@type/grammar';
import { t } from '@util/i18n';

/**
 * Maps internal TraceType identifiers to human-readable chart type labels
 * for display in the chart description modal and other user-facing surfaces.
 *
 * In `src/util/` rather than beside the traces because the chart's accessible
 * name is built from it before any model exists (`maidr-component.tsx`), and
 * a component reads nothing from the model layer.
 */
const CHART_TYPE_LABEL: Record<TraceType, MessageKey> = {
  [TraceType.AREA]: 'model.chartTypeArea',
  [TraceType.BAR]: 'model.chartTypeBar',
  [TraceType.BUMP]: 'model.chartTypeBump',
  [TraceType.BOX]: 'model.chartTypeBox',
  [TraceType.BOXEN]: 'model.chartTypeBoxen',
  [TraceType.ALLUVIAL]: 'model.chartTypeAlluvial',
  [TraceType.CANDLESTICK]: 'model.chartTypeCandlestick',
  [TraceType.CHORD]: 'model.chartTypeChord',
  [TraceType.SANKEY]: 'model.chartTypeSankey',
  [TraceType.NETWORK]: 'model.chartTypeNetwork',
  [TraceType.DIRECTED_GRAPH]: 'model.chartTypeDirectedGraph',
  [TraceType.SEQUENCE]: 'model.chartTypeSequence',
  [TraceType.VENN]: 'model.chartTypeVenn',
  [TraceType.CANDLESTICK_DELTA]: 'model.chartTypeCandlestickDelta',
  [TraceType.CHOROPLETH]: 'model.chartTypeChoropleth',
  [TraceType.CONTOUR]: 'model.chartTypeContour',
  [TraceType.DIVERGING]: 'model.chartTypeDiverging',
  [TraceType.DODGED]: 'model.chartTypeDodged',
  [TraceType.DOT]: 'model.chartTypeDot',
  [TraceType.DUMBBELL]: 'model.chartTypeDumbbell',
  [TraceType.ERROR_BAR]: 'model.chartTypeErrorBar',
  [TraceType.FOREST]: 'model.chartTypeForest',
  [TraceType.GANTT]: 'model.chartTypeGantt',
  [TraceType.FUNNEL]: 'model.chartTypeFunnel',
  [TraceType.GAUGE]: 'model.chartTypeGauge',
  [TraceType.HEATMAP]: 'model.chartTypeHeatmap',
  [TraceType.HEXBIN]: 'model.chartTypeHexbin',
  [TraceType.HISTOGRAM]: 'model.chartTypeHistogram',
  [TraceType.LINE]: 'model.chartTypeLine',
  [TraceType.LOLLIPOP]: 'model.chartTypeLollipop',
  [TraceType.MOSAIC]: 'model.chartTypeMosaic',
  [TraceType.NORMALIZED]: 'model.chartTypeNormalized',
  [TraceType.NORMALIZED_AREA]: 'model.chartTypeNormalizedArea',
  [TraceType.PARALLEL]: 'model.chartTypeParallel',
  [TraceType.PERCENTILE_BAND]: 'model.chartTypePercentileBand',
  [TraceType.PIE]: 'model.chartTypePie',
  [TraceType.POLAR_AREA]: 'model.chartTypePolarArea',
  [TraceType.PR_CURVE]: 'model.chartTypePrCurve',
  [TraceType.RADAR]: 'model.chartTypeRadar',
  [TraceType.RIDGELINE]: 'model.chartTypeRidgeline',
  [TraceType.ROC]: 'model.chartTypeRoc',
  [TraceType.RUG]: 'model.chartTypeRug',
  [TraceType.SCATTER]: 'model.chartTypeScatter',
  [TraceType.SUNFLOWER]: 'model.chartTypeSunflower',
  [TraceType.SMOOTH]: 'model.chartTypeSmooth',
  [TraceType.STACKED]: 'model.chartTypeStacked',
  [TraceType.STACKED_AREA]: 'model.chartTypeStackedArea',
  [TraceType.STEP]: 'model.chartTypeStep',
  [TraceType.SURVIVAL]: 'model.chartTypeSurvival',
  [TraceType.ICICLE]: 'model.chartTypeIcicle',
  [TraceType.SUNBURST]: 'model.chartTypeSunburst',
  [TraceType.TREE]: 'model.chartTypeTree',
  [TraceType.PACK]: 'model.chartTypePack',
  [TraceType.TREEMAP]: 'model.chartTypeTreemap',
  [TraceType.VIOLIN_BOX]: 'model.chartTypeViolinBox',
  [TraceType.VIOLIN_KDE]: 'model.chartTypeViolinKde',
  [TraceType.MANHATTAN]: 'model.chartTypeManhattan',
  [TraceType.VOLCANO]: 'model.chartTypeVolcano',
  [TraceType.WATERFALL]: 'model.chartTypeWaterfall',
  [TraceType.WORD_CLOUD]: 'model.chartTypeWordCloud',
};

/**
 * The human-readable name of a chart type, as the description dialog writes it.
 *
 * A free function because not every caller holds a trace:
 * `Figure.getSubplotSummaries` names the layers of panels the reader has not
 * entered, and the chart's accessible name is built before any model exists;
 * both have nothing but a {@link TraceType}. The map is declared `Record<TraceType, MessageKey>`, so every member has an entry
 * and a lookup cannot miss.
 *
 * @param type - The layer's trace type
 * @returns The label, e.g. `Scatter Plot` for {@link TraceType.SCATTER}
 */
export function chartTypeLabel(type: TraceType): string {
  return t(CHART_TYPE_LABEL[type]);
}

/**
 * The name a layer gives its own chart type, when it is read as a trace type
 * it is not ({@link MaidrLayer.typeLabel}).
 *
 * Beside {@link chartTypeLabel} for the reason that is a free function: the
 * chart's accessible name is built from it before any model exists. Guarded
 * rather than trusted, as a title is, because a producer's JSON can carry
 * anything.
 *
 * @param layer - The layer, when there is one
 * @returns The name, trimmed, or undefined when the layer gives none
 */
export function ownTypeLabel(layer?: Pick<MaidrLayer, 'typeLabel'>): string | undefined {
  const label: unknown = layer?.typeLabel;
  return typeof label === 'string' && label.trim() !== '' ? label.trim() : undefined;
}

/**
 * The guide a layer gives to the chart type it names ({@link MaidrLayer.typeGuide}).
 *
 * Only beside a name of its own, since the description heads the guide with
 * the chart type's name, and only whole: the dialog reads what the chart is,
 * what it is for and what it looks like together, so a guide missing a part,
 * or blank in one, is no guide. Guarded rather than trusted, as the name is.
 *
 * @param layer - The layer, when there is one
 * @returns The guide, each part trimmed, or undefined when the layer gives none
 */
export function ownTypeGuide(layer?: Pick<MaidrLayer, 'typeLabel' | 'typeGuide'>): ChartGuide | undefined {
  if (ownTypeLabel(layer) === undefined) {
    return undefined;
  }
  const guide: unknown = layer?.typeGuide;
  if (typeof guide !== 'object' || guide === null) {
    return undefined;
  }
  const part = (key: keyof ChartGuide): string => {
    const text: unknown = (guide as Record<string, unknown>)[key];
    return typeof text === 'string' ? text.trim() : '';
  };
  const definition = part('definition');
  const purpose = part('purpose');
  const appearance = part('appearance');
  return definition !== '' && purpose !== '' && appearance !== ''
    ? { definition, purpose, appearance }
    : undefined;
}

/** The layers already warned about, so a figure built twice warns once. */
const warnedTypeGuides = new Set<string>();

/**
 * Says so, once per layer, when a layer gives a guide to its chart type that
 * the description will not show: one beside no `typeLabel` to head it, or
 * one with a part missing or blank.
 *
 * The dialog then shows the trace type's guide, or none, without a word, and
 * the console is where a producer's author will look for why.
 *
 * @param layer - The layer
 */
export function warnUnreadTypeGuide(layer: Pick<MaidrLayer, 'id' | 'type' | 'typeLabel' | 'typeGuide'>): void {
  if (layer.typeGuide === undefined || layer.typeGuide === null || ownTypeGuide(layer) !== undefined) {
    return;
  }
  const unnamed = '`typeGuide` is set without a `typeLabel` to name the chart it explains, so the '
    + 'description shows the guide to the layer type instead.';
  const incomplete = '`typeGuide` needs a non-blank `definition`, `purpose` and `appearance`, and one '
    + 'is missing or blank, so the description shows no guide.';
  const problem = ownTypeLabel(layer) === undefined ? unnamed : incomplete;
  const key = `${layer.type}\u0000${layer.id}\u0000${problem}`;
  if (warnedTypeGuides.has(key)) {
    return;
  }
  warnedTypeGuides.add(key);
  console.warn(`[MAIDR] Layer "${layer.id}" (${layer.type}): ${problem}`);
}
