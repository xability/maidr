import type { BarPoint, LinePoint, MaidrLayer, ScatterPoint } from '@type/grammar';
import type { VictoryComponentType, VictoryLayerInfo } from './types';
import type { ReactElement, ReactNode } from 'react';
import { Children, isValidElement } from 'react';
import { TraceType } from '@type/grammar';

/**
 * Resolves the Victory component display name from a React element type.
 *
 * Victory components set `displayName` on their exported functions/classes.
 * This handles both direct components and wrapped (e.g. HOC) variants.
 */
function getVictoryDisplayName(type: unknown): string | null {
  if (!type) return null;

  // Function/class component with displayName
  if (typeof type === 'function' || typeof type === 'object') {
    const name = (type as { displayName?: string; name?: string }).displayName
      ?? (type as { name?: string }).name
      ?? '';
    if (name.startsWith('Victory')) return name;
  }

  return null;
}

/**
 * Checks whether a display name corresponds to a supported Victory data component.
 */
function isSupportedVictoryType(name: string): name is VictoryComponentType {
  return (
    name === 'VictoryBar'
    || name === 'VictoryLine'
    || name === 'VictoryScatter'
    || name === 'VictoryArea'
    || name === 'VictoryPie'
  );
}

/**
 * Resolves the data accessor for a Victory component prop.
 *
 * Victory allows `x` and `y` to be a string key, a function, or omitted
 * (defaults to "x" / "y").
 */
function resolveAccessor(accessor: unknown, fallback: string): (d: Record<string, unknown>) => unknown {
  if (typeof accessor === 'function') return accessor as (d: Record<string, unknown>) => unknown;
  if (typeof accessor === 'string') return (d: Record<string, unknown>) => d[accessor];
  return (d: Record<string, unknown>) => d[fallback];
}

/**
 * Extracts axis labels from VictoryAxis children inside a VictoryChart.
 */
function extractAxisLabels(children: ReactNode): { x?: string; y?: string } {
  const result: { x?: string; y?: string } = {};

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const name = getVictoryDisplayName(child.type);
    if (name !== 'VictoryAxis') return;

    const props = child.props as Record<string, unknown>;
    const label = props.label as string | undefined;
    if (!label) return;

    if (props.dependentAxis) {
      result.y = label;
    } else {
      result.x = label;
    }
  });

  return result;
}

/**
 * Converts a single Victory data component into a {@link VictoryLayerInfo}.
 */
function extractLayerFromElement(
  element: ReactElement,
  layerId: number,
  axisLabels: { x?: string; y?: string },
): VictoryLayerInfo | null {
  const name = getVictoryDisplayName(element.type);
  if (!name || !isSupportedVictoryType(name)) return null;

  const props = element.props as Record<string, unknown>;
  const rawData = props.data as Record<string, unknown>[] | undefined;
  if (!rawData || !Array.isArray(rawData) || rawData.length === 0) return null;

  const getX = resolveAccessor(props.x, 'x');
  const getY = resolveAccessor(props.y, 'y');

  return {
    id: String(layerId),
    victoryType: name,
    data: rawData.map(d => ({ x: getX(d), y: getY(d) })),
    xAxisLabel: axisLabels.x,
    yAxisLabel: axisLabels.y,
    dataCount: rawData.length,
  };
}

/**
 * Walks the React element tree to extract Victory data layers.
 *
 * Handles both:
 * - `<VictoryChart>` wrappers (processes children)
 * - Standalone data components (e.g. `<VictoryPie>`)
 */
export function extractVictoryLayers(children: ReactNode): VictoryLayerInfo[] {
  const layers: VictoryLayerInfo[] = [];
  let layerId = 0;

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;

    const name = getVictoryDisplayName(child.type);

    if (name === 'VictoryChart') {
      const chartProps = child.props as { children?: ReactNode };
      const axisLabels = extractAxisLabels(chartProps.children);

      Children.forEach(chartProps.children, (grandchild) => {
        if (!isValidElement(grandchild)) return;
        const layer = extractLayerFromElement(grandchild, layerId, axisLabels);
        if (layer) {
          layers.push(layer);
          layerId++;
        }
      });
    } else {
      const layer = extractLayerFromElement(child, layerId, { });
      if (layer) {
        layers.push(layer);
        layerId++;
      }
    }
  });

  return layers;
}

/**
 * Converts a {@link VictoryLayerInfo} into the MAIDR {@link MaidrLayer} schema.
 *
 * @param layer  - Intermediate Victory layer info
 * @param selector - CSS selector for the SVG elements (may be undefined if
 *                   tagging was not possible)
 */
export function toMaidrLayer(layer: VictoryLayerInfo, selector?: string): MaidrLayer {
  const axes: MaidrLayer['axes'] = {
    x: layer.xAxisLabel,
    y: layer.yAxisLabel,
  };

  switch (layer.victoryType) {
    case 'VictoryBar':
    case 'VictoryPie':
      return {
        id: layer.id,
        type: TraceType.BAR,
        axes,
        selectors: selector,
        data: layer.data as BarPoint[],
      };

    case 'VictoryLine':
    case 'VictoryArea':
      return {
        id: layer.id,
        type: TraceType.LINE,
        axes,
        selectors: selector ? [selector] : undefined,
        data: [layer.data as LinePoint[]],
      };

    case 'VictoryScatter':
      return {
        id: layer.id,
        type: TraceType.SCATTER,
        axes,
        selectors: selector,
        data: layer.data as ScatterPoint[],
      };
  }
}
