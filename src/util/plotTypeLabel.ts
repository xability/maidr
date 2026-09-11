import type { MessageKey } from '@util/i18n';
import { TraceType } from '@type/grammar';
import { t } from '@util/i18n';

/**
 * How each trace type announces itself when it does not name itself.
 *
 * The English rendering of every key here is the type's wire value — `bar`,
 * `stacked_bar` — which is what the entry announcement has always said, so
 * the sentence is unchanged. A trace with a name of its own for what it is
 * (a line calls itself `multiline`, a radar `polar area`) sets `plotType`
 * itself and never reaches this.
 */
const PLOT_TYPE_LABEL: Record<TraceType, MessageKey> = {
  [TraceType.AREA]: 'model.plotTypeArea',
  [TraceType.BAR]: 'model.plotTypeBar',
  [TraceType.BUMP]: 'model.plotTypeBump',
  [TraceType.BOX]: 'model.plotTypeBox',
  [TraceType.BOXEN]: 'model.plotTypeBoxen',
  [TraceType.ALLUVIAL]: 'model.plotTypeAlluvial',
  [TraceType.CANDLESTICK]: 'model.plotTypeCandlestick',
  [TraceType.CHORD]: 'model.plotTypeChord',
  [TraceType.SANKEY]: 'model.plotTypeSankey',
  [TraceType.NETWORK]: 'model.plotTypeNetwork',
  [TraceType.CANDLESTICK_DELTA]: 'model.plotTypeCandlestickDelta',
  [TraceType.CHOROPLETH]: 'model.plotTypeChoropleth',
  [TraceType.CONTOUR]: 'model.plotTypeContour',
  [TraceType.DIVERGING]: 'model.plotTypeDiverging',
  [TraceType.DODGED]: 'model.plotTypeDodged',
  [TraceType.DOT]: 'model.plotTypeDot',
  [TraceType.DUMBBELL]: 'model.plotTypeDumbbell',
  [TraceType.ERROR_BAR]: 'model.plotTypeErrorBar',
  [TraceType.FOREST]: 'model.plotTypeForest',
  [TraceType.GANTT]: 'model.plotTypeGantt',
  [TraceType.FUNNEL]: 'model.plotTypeFunnel',
  [TraceType.GAUGE]: 'model.plotTypeGauge',
  [TraceType.HEATMAP]: 'model.plotTypeHeatmap',
  [TraceType.HEXBIN]: 'model.plotTypeHexbin',
  [TraceType.HISTOGRAM]: 'model.plotTypeHistogram',
  [TraceType.LINE]: 'model.plotTypeLine',
  [TraceType.LOLLIPOP]: 'model.plotTypeLollipop',
  [TraceType.MOSAIC]: 'model.plotTypeMosaic',
  [TraceType.NORMALIZED]: 'model.plotTypeNormalized',
  [TraceType.NORMALIZED_AREA]: 'model.plotTypeNormalizedArea',
  [TraceType.PARALLEL]: 'model.plotTypeParallel',
  [TraceType.PIE]: 'model.plotTypePie',
  [TraceType.POLAR_AREA]: 'model.plotTypePolarArea',
  [TraceType.RADAR]: 'model.plotTypeRadar',
  [TraceType.RIDGELINE]: 'model.plotTypeRidgeline',
  [TraceType.SCATTER]: 'model.plotTypeScatter',
  [TraceType.SUNFLOWER]: 'model.plotTypeSunflower',
  [TraceType.SMOOTH]: 'model.plotTypeSmooth',
  [TraceType.STACKED]: 'model.plotTypeStacked',
  [TraceType.STACKED_AREA]: 'model.plotTypeStackedArea',
  [TraceType.STEP]: 'model.plotTypeStep',
  [TraceType.SURVIVAL]: 'model.plotTypeSurvival',
  [TraceType.ICICLE]: 'model.plotTypeIcicle',
  [TraceType.SUNBURST]: 'model.plotTypeSunburst',
  [TraceType.TREE]: 'model.plotTypeTree',
  [TraceType.PACK]: 'model.plotTypePack',
  [TraceType.TREEMAP]: 'model.plotTypeTreemap',
  [TraceType.VIOLIN_BOX]: 'model.plotTypeViolinBox',
  [TraceType.VIOLIN_KDE]: 'model.plotTypeViolinKde',
  [TraceType.MANHATTAN]: 'model.plotTypeManhattan',
  [TraceType.VOLCANO]: 'model.plotTypeVolcano',
  [TraceType.WATERFALL]: 'model.plotTypeWaterfall',
  [TraceType.WORD_CLOUD]: 'model.plotTypeWordCloud',
};

/**
 * How a trace type announces itself in the entry instruction.
 *
 * @param type - The layer's trace type
 * @returns The spoken plot type, e.g. `bar` for {@link TraceType.BAR}
 */
export function plotTypeLabel(type: TraceType): string {
  return t(PLOT_TYPE_LABEL[type]);
}
