import type { Disposable } from '@type/disposable';
import type { FormatConfig, FormatFunction, Maidr } from '@type/grammar';
import type { AxisType } from '@type/state';
import type { FormattableValue } from '@util/format';
import { defaultFormat, FormatUtil } from '@util/format';

export type { AxisType };

/**
 * Internal structure for storing resolved format functions per layer.
 */
interface LayerFormatters {
  x: FormatFunction;
  y: FormatFunction;
  fill: FormatFunction;
}

/**
 * Service for managing value formatting across all layers in a MAIDR figure.
 *
 * The FormatterService extracts format configurations from layer definitions
 * and provides methods to format values consistently throughout the application.
 *
 * @example
 * ```typescript
 * // In Controller
 * const formatterService = new FormatterService(maidrData);
 *
 * // Format a value
 * const formatted = formatterService.formatValue(128.47, 'layer-1', 'y');
 * // Returns "$128.47" if layer has currency formatter
 *
 * // Format an array (e.g., boxplot outliers)
 * const formattedArray = formatterService.formatValue(
 *   [-9.795, 6.057, 14.736],
 *   'layer-1',
 *   'y'
 * );
 * // Returns ["-9.80", "6.06", "14.74"] if layer has 2-decimal formatter
 * ```
 */
export class FormatterService implements Disposable {
  /**
   * Map of layer IDs to their resolved format functions.
   */
  private readonly formatters: Map<string, LayerFormatters>;

  /**
   * Creates a new FormatterService from MAIDR data.
   * Extracts format configurations from all layers and resolves format functions.
   *
   * @param maidr - The MAIDR data containing layers with optional format configs
   */
  public constructor(maidr: Maidr) {
    this.formatters = new Map();
    this.initializeFormatters(maidr);
  }

  /**
   * Extracts and resolves format configurations from all layers in the MAIDR data.
   */
  private initializeFormatters(maidr: Maidr): void {
    // Iterate through all subplots and layers
    for (const subplotRow of maidr.subplots) {
      for (const subplot of subplotRow) {
        for (const layer of subplot.layers) {
          const layerId = layer.id;
          // Format config is now nested inside axes
          const formatConfig = layer.axes?.format;

          // Resolve format functions with fallback to defaults
          const layerFormatters: LayerFormatters = {
            x: this.resolveAxisFormat(formatConfig?.x),
            y: this.resolveAxisFormat(formatConfig?.y),
            fill: this.resolveAxisFormat(formatConfig?.fill),
          };

          this.formatters.set(layerId, layerFormatters);
        }
      }
    }
  }

  /**
   * Resolves an axis format configuration to a format function.
   * Wraps the resolved function with edge case handling.
   */
  private resolveAxisFormat(axisFormat?: FormatConfig[keyof FormatConfig]): FormatFunction {
    const baseFormat = FormatUtil.resolveFormat(axisFormat);
    return FormatUtil.wrapFormat(baseFormat);
  }

  /**
   * Gets the format function for a specific layer and axis.
   *
   * @param layerId - The ID of the layer
   * @param axis - The axis type ('x', 'y', or 'fill')
   * @returns The format function, or defaultFormat if not found
   */
  public getFormatter(layerId: string, axis: AxisType): FormatFunction {
    const layerFormatters = this.formatters.get(layerId);
    if (!layerFormatters) {
      return defaultFormat;
    }
    return layerFormatters[axis];
  }

  /**
   * Checks if a layer has a custom formatter for the specified axis.
   *
   * @param layerId - The ID of the layer
   * @param axis - The axis type ('x', 'y', or 'fill')
   * @returns True if a custom formatter is configured
   */
  public hasCustomFormatter(layerId: string, axis: AxisType): boolean {
    const layerFormatters = this.formatters.get(layerId);
    if (!layerFormatters) {
      return false;
    }
    // Check if the formatter is not the default
    return layerFormatters[axis] !== defaultFormat;
  }

  /**
   * Formats a value (single or array) using the formatter for the specified layer and axis.
   *
   * This is the primary method for formatting values in the application.
   * It handles both single values and arrays (e.g., boxplot outliers).
   *
   * @param value - The value or array of values to format
   * @param layerId - The ID of the layer
   * @param axis - The axis type ('x', 'y', or 'fill')
   * @returns Formatted string or array of formatted strings
   *
   * @example
   * // Single value
   * formatValue(128.47, 'layer-1', 'y') // "$128.47"
   *
   * // Array of values (boxplot outliers)
   * formatValue([-9.795, 6.057], 'layer-1', 'y') // ["-9.80", "6.06"]
   */
  public formatValue(
    value: FormattableValue,
    layerId: string,
    axis: AxisType,
  ): string | string[] {
    const formatter = this.getFormatter(layerId, axis);
    return FormatUtil.applyFormat(value, formatter);
  }

  /**
   * Formats a single value (not an array) and always returns a string.
   * Use this when you're certain the value is not an array.
   *
   * @param value - The single value to format
   * @param layerId - The ID of the layer
   * @param axis - The axis type ('x', 'y', or 'fill')
   * @returns Formatted string
   */
  public formatSingleValue(
    value: number | string,
    layerId: string,
    axis: AxisType,
  ): string {
    const formatter = this.getFormatter(layerId, axis);
    return formatter(value);
  }

  /**
   * Formats an array of values and always returns a string array.
   * Use this when you're certain the value is an array.
   *
   * @param values - The array of values to format
   * @param layerId - The ID of the layer
   * @param axis - The axis type ('x', 'y', or 'fill')
   * @returns Array of formatted strings
   */
  public formatArrayValue(
    values: (number | string)[],
    layerId: string,
    axis: AxisType,
  ): string[] {
    const formatter = this.getFormatter(layerId, axis);
    return values.map(v => formatter(v));
  }

  /**
   * Releases resources held by the service.
   */
  public dispose(): void {
    this.formatters.clear();
  }
}
