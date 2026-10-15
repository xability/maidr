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
