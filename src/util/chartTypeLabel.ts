import type { MaidrLayer } from '@type/grammar';
import type { ChartGuide } from '@type/state';
import type { MessageKey } from '@util/i18n';
import { DiagramType, TraceType } from '@type/grammar';
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

/** Every diagram type MAIDR knows, for checking a value a producer sent. */
const DIAGRAM_TYPES: ReadonlySet<string> = new Set(Object.values(DiagramType));

/** The levels of a C4 diagram, which share the C4 diagram's guide. */
type C4Level
  = | DiagramType.C4_CONTEXT
    | DiagramType.C4_CONTAINER
    | DiagramType.C4_COMPONENT
    | DiagramType.C4_DYNAMIC
    | DiagramType.C4_DEPLOYMENT;

/**
 * The diagram type whose guide explains a diagram type: its own, but a C4
 * diagram's for each level of one, since what a C4 diagram is, what it is for
 * and what it looks like holds at every level.
 *
 * @param type - The diagram type
 * @returns The diagram type that keys its guide
 */
function guideOf(type: DiagramType): Exclude<DiagramType, C4Level> {
  switch (type) {
    case DiagramType.C4_CONTEXT:
    case DiagramType.C4_CONTAINER:
    case DiagramType.C4_COMPONENT:
    case DiagramType.C4_DYNAMIC:
    case DiagramType.C4_DEPLOYMENT:
      return DiagramType.C4;
    default:
      return type;
  }
}

/**
 * The name of a diagram MAIDR knows, in the active locale.
 *
 * The keys are built from the {@link DiagramType} value, so a type added
 * without a name fails the type check here.
 *
 * @param type - The diagram type
 * @returns The name, e.g. `Flowchart` for {@link DiagramType.FLOWCHART}
 */
export function diagramTypeLabel(type: DiagramType): string {
  return t(`diagram.${type}.name`);
}

/**
 * The guide to a diagram MAIDR knows, in the active locale: what it is, what
 * it is for and what it looks like, as a layer type's guide says.
 *
 * @param type - The diagram type
 * @returns The guide's three parts
 */
export function diagramTypeGuide(type: DiagramType): ChartGuide {
  const guide = guideOf(type);
  return {
    definition: t(`diagram.${guide}.definition`),
    purpose: t(`diagram.${guide}.purpose`),
    appearance: t(`diagram.${guide}.appearance`),
  };
}

/**
 * The diagram a layer says it is ({@link MaidrLayer.diagramType}), when MAIDR
 * knows it. Guarded rather than trusted, as a title is, because a producer's
 * JSON can carry anything.
 *
 * @param layer - The layer, when there is one
 * @returns The diagram type, or undefined when the layer names none MAIDR knows
 */
export function ownDiagramType(layer?: Pick<MaidrLayer, 'diagramType'>): DiagramType | undefined {
  const type: unknown = layer?.diagramType;
  return typeof type === 'string' && DIAGRAM_TYPES.has(type.trim()) ? type.trim() as DiagramType : undefined;
}

/**
 * The name a layer gives its own chart type, when it is read as a trace type
 * it is not: the diagram it names, in the active locale
 * ({@link MaidrLayer.diagramType}), or the name it writes out
 * ({@link MaidrLayer.typeLabel}).
 *
 * Beside {@link chartTypeLabel} for the reason that is a free function: the
 * chart's accessible name is built from it before any model exists. Guarded
 * rather than trusted, as a title is, because a producer's JSON can carry
 * anything.
 *
 * @param layer - The layer, when there is one
 * @returns The name, trimmed, or undefined when the layer gives none
 */
export function ownTypeLabel(layer?: Pick<MaidrLayer, 'typeLabel' | 'diagramType'>): string | undefined {
  const diagram = ownDiagramType(layer);
  if (diagram !== undefined) {
    return diagramTypeLabel(diagram);
  }
  const label: unknown = layer?.typeLabel;
  return typeof label === 'string' && label.trim() !== '' ? label.trim() : undefined;
}

/**
 * The guide a layer gives to the chart type it names: the diagram's, in the
 * active locale ({@link MaidrLayer.diagramType}), or the one it writes out
 * ({@link MaidrLayer.typeGuide}).
 *
 * A guide written out is read only beside a name of its own, since the
 * description heads the guide with the chart type's name, and only whole: the
 * dialog reads what the chart is, what it is for and what it looks like
 * together, so a guide missing a part, or blank in one, is no guide. Guarded
 * rather than trusted, as the name is.
 *
 * @param layer - The layer, when there is one
 * @returns The guide, each part trimmed, or undefined when the layer gives none
 */
export function ownTypeGuide(layer?: Pick<MaidrLayer, 'typeLabel' | 'typeGuide' | 'diagramType'>): ChartGuide | undefined {
  const diagram = ownDiagramType(layer);
  if (diagram !== undefined) {
    return diagramTypeGuide(diagram);
  }
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
const warnedTypeFields = new Set<string>();

/**
 * Says a problem with a layer's chart type fields in the console, once per
 * layer and problem.
 *
 * @param layer - The layer
 * @param problem - What is wrong, and what the description does instead
 */
function warnOnce(layer: Pick<MaidrLayer, 'id' | 'type'>, problem: string): void {
  const key = `${layer.type}\u0000${layer.id}\u0000${problem}`;
  if (warnedTypeFields.has(key)) {
    return;
  }
  warnedTypeFields.add(key);
  console.warn(`[MAIDR] Layer "${layer.id}" (${layer.type}): ${problem}`);
}

/**
 * Says so, once per layer, when a layer gives a guide to its chart type that
 * the description will not show: one beside no `typeLabel` to head it, or
 * one with a part missing or blank.
 *
 * The dialog then shows the trace type's guide, or none, without a word, and
 * the console is where a producer's author will look for why. A guide beside
 * a diagram MAIDR knows is not said: the diagram's own guide is shown, and
 * the one written out is there for a MAIDR that does not know it.
 *
 * @param layer - The layer
 */
export function warnUnreadTypeGuide(
  layer: Pick<MaidrLayer, 'id' | 'type' | 'typeLabel' | 'typeGuide' | 'diagramType'>,
): void {
  if (layer.typeGuide === undefined || layer.typeGuide === null || ownTypeGuide(layer) !== undefined) {
    return;
  }
  const unnamed = '`typeGuide` is set without a `typeLabel` to name the chart it explains, so the '
    + 'description shows the guide to the layer type instead.';
  const incomplete = '`typeGuide` needs a non-blank `definition`, `purpose` and `appearance`, and one '
    + 'is missing or blank, so the description shows no guide.';
  warnOnce(layer, ownTypeLabel(layer) === undefined ? unnamed : incomplete);
}

/**
 * Says so, once per layer, when a layer names a diagram type MAIDR does not
 * know ({@link MaidrLayer.diagramType}): one misspelt, or added in a later
 * MAIDR. The chart is then named by its `typeLabel`, or as its layer type.
 *
 * @param layer - The layer
 */
export function warnUnknownDiagramType(layer: Pick<MaidrLayer, 'id' | 'type' | 'diagramType'>): void {
  const type: unknown = layer.diagramType;
  if (type === undefined || type === null || (typeof type === 'string' && type.trim() === '')) {
    return;
  }
  if (ownDiagramType(layer) !== undefined) {
    return;
  }
  const given = typeof type === 'string' ? `"${type}"` : String(type);
  warnOnce(layer, `\`diagramType\` ${given} is not a diagram type this MAIDR knows, so the `
  + 'chart is named by its `typeLabel`, or as its layer type. Known diagram types are '
  + `${[...DIAGRAM_TYPES].join(', ')}.`);
}
