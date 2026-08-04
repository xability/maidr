import type { AxisFormat, FormatFunction, FormatType } from '@type/grammar';

/**
 * Value type that can be formatted - single value or array of values.
 */
export type FormattableValue = number | string | (number | string)[];

/**
 * Decimal places the default format keeps for a fractional number. Matches the
 * precision the Go To Extrema dialog already displays values at.
 */
const DEFAULT_MAX_DECIMALS = 2;

/**
 * Significant digits used for a value too small to survive rounding to
 * {@link DEFAULT_MAX_DECIMALS} places.
 */
const DEFAULT_SIGNIFICANT_DIGITS = 3;

/**
 * Default format function - converts value to string.
 * Strings pass through unchanged, integers are stringified as-is.
 *
 * A fractional number is rounded to {@link DEFAULT_MAX_DECIMALS} places, because
 * this is what a screen reader speaks aloud. A value MAIDR computes rather than
 * reads verbatim — a `barnorm` share, a percentage of a stack — carries the full
 * float, and `57.14285714285714` is sixteen digits to listen through for two
 * digits of meaning.
 *
 * Rounding stops at the announcement. Sonification, braille, and extrema all
 * read the underlying numbers, so the pitch of a bar and the position of a
 * braille cell are unchanged; only the spoken text is shortened. An author who
 * needs different precision sets an explicit `AxisFormat` on the axis, which
 * takes priority over this.
 *
 * @param value - The value to format
 * @returns String representation of the value
 */
export const defaultFormat: FormatFunction = (value: number | string): string => {
  if (typeof value !== 'number' || !Number.isFinite(value) || Number.isInteger(value)) {
    return `${value}`;
  }

  const rounded = Number(value.toFixed(DEFAULT_MAX_DECIMALS));
  if (rounded !== 0) {
    return `${rounded}`;
  }

  // Rounding erased the value (0.00012 -> 0). Announcing `0` for something that
  // is not zero is worse than the extra digits, so keep it visible instead.
  return `${Number(value.toPrecision(DEFAULT_SIGNIFICANT_DIGITS))}`;
};

/**
 * Pre-built formatter factories for common formatting patterns.
 * Used internally by type specifiers.
 */
export const formatters = {
  /**
   * Creates a currency formatter.
   *
   * @param currency - ISO 4217 currency code (default: 'USD')
   * @param decimals - Number of decimal places (default: 2)
   * @param locale - BCP 47 locale string (default: 'en-US')
   * @returns Format function that formats numbers as currency
   *
   * @example
   * formatters.currency('USD', 2)(1234.5) // "$1,234.50"
   * formatters.currency('EUR', 0, 'de-DE')(1234) // "1.234 EUR"
   */
  currency: (currency = 'USD', decimals = 2, locale = 'en-US'): FormatFunction =>
    (value: number | string): string => {
      const num = typeof value === 'number' ? value : Number.parseFloat(String(value));
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(num);
    },

  /**
   * Creates a percentage formatter.
   *
   * @param decimals - Number of decimal places (default: 1)
   * @returns Format function that formats numbers as percentages
   *
   * @example
   * formatters.percent(1)(0.156) // "15.6%"
   * formatters.percent(0)(0.75) // "75%"
   */
  percent: (decimals = 1): FormatFunction =>
    (value: number | string): string => {
      const num = typeof value === 'number' ? value : Number.parseFloat(String(value));
      return `${(num * 100).toFixed(decimals)}%`;
    },

  /**
   * Creates a date formatter using Intl.DateTimeFormat.
   *
   * @param options - Intl.DateTimeFormat options
   * @param locale - BCP 47 locale string (default: 'en-US')
   * @returns Format function that formats values as dates
   *
   * @example
   * formatters.date({ month: 'short', day: 'numeric' })('2023-01-15') // "Jan 15"
   * formatters.date({ year: 'numeric', month: 'long' })(1704067200000) // "January 2024"
   */
  date: (options?: Intl.DateTimeFormatOptions, locale = 'en-US'): FormatFunction =>
    (value: number | string): string => {
      const date = new Date(value);
      return new Intl.DateTimeFormat(locale, options).format(date);
    },

  /**
   * Creates a number formatter with optional decimal places and grouping.
   *
   * @param decimals - Number of decimal places (default: 0)
   * @param locale - BCP 47 locale string (default: 'en-US')
   * @returns Format function that formats numbers with grouping
   *
   * @example
   * formatters.number(2)(1234567.89) // "1,234,567.89"
   * formatters.number(0, 'de-DE')(1234567) // "1.234.567"
   */
  number: (decimals = 0, locale = 'en-US'): FormatFunction =>
    (value: number | string): string => {
      const num = typeof value === 'number' ? value : Number.parseFloat(String(value));
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(num);
    },

  /**
   * Creates a scientific notation formatter.
   *
   * @param decimals - Number of decimal places in mantissa (default: 2)
   * @returns Format function that formats numbers in scientific notation
   *
   * @example
   * formatters.scientific(2)(1234567) // "1.23e+6"
   * formatters.scientific(3)(0.000123) // "1.230e-4"
   */
  scientific: (decimals = 2): FormatFunction =>
    (value: number | string): string => {
      const num = typeof value === 'number' ? value : Number.parseFloat(String(value));
      return num.toExponential(decimals);
    },

  /**
   * Creates a fixed decimal places formatter.
   *
   * @param decimals - Number of decimal places (default: 2)
   * @returns Format function that formats numbers with fixed decimals
   *
   * @example
   * formatters.fixed(2)(3.14159) // "3.14"
   * formatters.fixed(0)(3.7) // "4"
   */
  fixed: (decimals = 2): FormatFunction =>
    (value: number | string): string => {
      const num = typeof value === 'number' ? value : Number.parseFloat(String(value));
      return num.toFixed(decimals);
    },
};

/**
 * Formatting utility functions for MAIDR value display.
 * Provides format resolution, application, and pre-built formatter factories.
 */
export abstract class FormatUtil {
  private constructor() { /* Prevent instantiation */ }

  /**
   * Resolves a format function from an AxisFormat configuration.
   *
   * Priority order:
   * 1. `function` - Function body string (custom logic)
   * 2. `type` - Format type specifier (common patterns)
   * 3. Default (toString)
   *
   * @param axisFormat - Optional axis format configuration
   * @returns Resolved format function
   */
  static resolveFormat(axisFormat?: AxisFormat): FormatFunction {
    if (!axisFormat) {
      return defaultFormat;
    }

    // Priority 1: Function body string
    if (axisFormat.function) {
      try {
        // eslint-disable-next-line no-new-func
        return new Function('value', axisFormat.function) as FormatFunction;
      } catch {
        console.warn('Invalid format function string:', axisFormat.function);
        return defaultFormat;
      }
    }

    // Priority 2: Type specifier
    if (axisFormat.type) {
      return this.resolveTypeSpecifier(axisFormat);
    }

    // Fallback: default format
    return defaultFormat;
  }

  /**
   * Resolves a format type specifier to a format function.
   *
   * @param axisFormat - Axis format configuration with type specifier
   * @returns Format function for the specified type
   */
  private static resolveTypeSpecifier(axisFormat: AxisFormat): FormatFunction {
    const { type, decimals, currency, locale, dateOptions } = axisFormat;

    switch (type as FormatType) {
      case 'currency':
        return formatters.currency(currency ?? 'USD', decimals ?? 2, locale ?? 'en-US');
      case 'percent':
        return formatters.percent(decimals ?? 1);
      case 'fixed':
        return formatters.fixed(decimals ?? 2);
      case 'number':
        return formatters.number(decimals ?? 0, locale ?? 'en-US');
      case 'date':
        return formatters.date(dateOptions, locale ?? 'en-US');
      case 'scientific':
        return formatters.scientific(decimals ?? 2);
      default:
        return defaultFormat;
    }
  }

  /**
   * Wraps a format function with edge case handling.
   * Handles null, undefined, and NaN values gracefully.
   *
   * @param format - The format function to wrap
   * @param options - Options for handling edge cases
   * @param options.missingText - Text to display for missing/invalid values (default: 'missing')
   * @returns Wrapped format function with edge case handling
   */
  static wrapFormat(
    format: FormatFunction,
    options?: {
      missingText?: string;
    },
  ): FormatFunction {
    const { missingText = 'missing' } = options ?? {};

    return (value: number | string): string => {
      // Handle null/undefined (shouldn't happen with TypeScript, but defensive)
      if (value === null || value === undefined) {
        return missingText;
      }

      // Handle NaN for numbers
      if (typeof value === 'number' && Number.isNaN(value)) {
        return missingText;
      }

      // Normal case: apply the format function
      return format(value);
    };
  }

  /**
   * Applies a format function to a single value or array of values.
   * When given an array, formats each element individually.
   *
   * @param value - Single value or array of values to format
   * @param formatter - Format function to apply
   * @returns Formatted string or array of formatted strings
   */
  static applyFormat(
    value: FormattableValue,
    formatter: FormatFunction,
  ): string | string[] {
    if (Array.isArray(value)) {
      return value.map(v => formatter(v));
    }
    return formatter(value);
  }
}
