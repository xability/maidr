import type { AxisFormatConfig, FormattingConfig } from '@type/grammar';
import { format, isValid, parse } from 'date-fns';

/**
 * Service for formatting data values according to user configuration
 * Maintains raw data for other services while providing formatted display values
 */
export class DataFormattingService {
  private readonly defaultLocale: string;
  private readonly defaultTimezone: string;

  constructor() {
    this.defaultLocale = 'en-US';
    this.defaultTimezone = 'UTC';
  }

  /**
   * Format a value according to the provided configuration
   * @param value The raw value to format
   * @param config The formatting configuration
   * @returns Formatted string value
   */
  public formatValue(value: any, config?: FormattingConfig): string {
    if (config === undefined) {
      return String(value);
    }

    // Only apply formatting if explicitly configured
    if (config.priceFormat && typeof value === 'number') {
      return this.formatPrice(value, config);
    }

    if (config.dateFormat && typeof value === 'string' && this.isDateString(value)) {
      return this.formatDate(value, config);
    }

    if (config.numberFormat && typeof value === 'number') {
      return this.formatNumber(value, config);
    }

    // If no specific formatting is configured, return as string
    return String(value);
  }

  /**
   * Format a value according to axis-specific configuration
   * @param value The raw value to format
   * @param axisConfig The axis formatting configuration
   * @returns Formatted string value
   */
  public formatValueWithAxisConfig(value: any, axisConfig?: AxisFormatConfig): string {
    if (axisConfig === undefined) {
      return String(value);
    }

    // Only apply formatting if explicitly configured
    if (axisConfig.priceFormat && typeof value === 'number') {
      return this.formatPrice(value, { priceFormat: axisConfig.priceFormat });
    }

    if (axisConfig.dateFormat && typeof value === 'string' && this.isDateString(value)) {
      return this.formatDate(value, { dateFormat: axisConfig.dateFormat });
    }

    if (axisConfig.numberFormat && typeof value === 'number') {
      return this.formatNumber(value, { numberFormat: axisConfig.numberFormat });
    }

    // If no specific formatting is configured, return as string
    return String(value);
  }

  /**
   * Check if a string looks like a date using multiple patterns
   */
  public isDateString(value: string): boolean {
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
      /^\d{4}-\d{2}-\d{2}T/, // ISO with time
      /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
      /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
      /^[A-Z]+ \d{1,2},? \d{4}$/i, // Month DD, YYYY
    ];

    return datePatterns.some(pattern => pattern.test(value));
  }

  /**
   * Format a price value as currency
   */
  private formatPrice(value: number, config: FormattingConfig): string {
    try {
      const priceConfig = config.priceFormat;
      const locale = config.locale || this.defaultLocale;

      const options: Intl.NumberFormatOptions = {
        style: 'currency',
        currency: priceConfig?.currency || 'USD',
        minimumFractionDigits: priceConfig?.minimumFractionDigits || 2,
        maximumFractionDigits: priceConfig?.maximumFractionDigits || 2,
        useGrouping: priceConfig?.useGrouping !== false,
      };

      return new Intl.NumberFormat(locale, options).format(value);
    } catch (error) {
      return String(value);
    }
  }

  /**
   * Format a number value
   */
  private formatNumber(value: number, config: FormattingConfig): string {
    try {
      const numberConfig = config.numberFormat;
      const locale = config.locale || this.defaultLocale;

      const options: Intl.NumberFormatOptions = {
        style: (numberConfig?.style as any) || 'decimal',
        useGrouping: numberConfig?.useGrouping !== false,
      };

      if (numberConfig?.minimumFractionDigits !== undefined) {
        options.minimumFractionDigits = numberConfig.minimumFractionDigits;
      }
      if (numberConfig?.maximumFractionDigits !== undefined) {
        options.maximumFractionDigits = numberConfig.maximumFractionDigits;
      }
      if (numberConfig?.currency) {
        options.currency = numberConfig.currency;
      }

      return new Intl.NumberFormat(locale, options).format(value);
    } catch (error) {
      return String(value);
    }
  }

  /**
   * Format a date value using robust parsing
   */
  private formatDate(value: string, config: FormattingConfig): string {
    try {
      const dateConfig = config.dateFormat;
      const locale = config.locale || this.defaultLocale;
      const timezone = config.timezone || this.defaultTimezone;

      // Parse the date string using multiple common formats
      const parsedDate = this.parseDateString(value);

      if (!parsedDate || !isValid(parsedDate)) {
        return String(value);
      }

      // If custom format is provided, use it
      if (dateConfig?.customFormat) {
        return this.formatDateWithCustomFormat(parsedDate, dateConfig.customFormat, locale, timezone);
      }

      // Use Intl.DateTimeFormat for standard formatting
      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone,
      };

      // Use dateStyle if provided, otherwise use default formatting
      if (dateConfig?.style) {
        options.dateStyle = dateConfig.style;
      } else {
        // Default formatting options
        options.year = 'numeric';
        options.month = 'short';
        options.day = 'numeric';
      }

      return parsedDate.toLocaleDateString(locale, options);
    } catch (error) {
      return String(value);
    }
  }

  /**
   * Parse date string using multiple common formats
   */
  private parseDateString(dateString: string): Date | null {
    // Common date formats to try
    const formats = [
      'yyyy-MM-dd', // 2021-01-01
      'yyyy-MM-dd\'T\'HH:mm:ss', // 2021-01-01T12:00:00
      'yyyy-MM-dd\'T\'HH:mm:ss.SSS', // 2021-01-01T12:00:00.000
      'MM/dd/yyyy', // 01/01/2021
      'dd-MM-yyyy', // 01-01-2021
      'MMMM dd, yyyy', // January 01, 2021
      'MMM dd, yyyy', // Jan 01, 2021
    ];

    // Try each format
    for (const formatStr of formats) {
      try {
        const parsed = parse(dateString, formatStr, new Date());
        if (isValid(parsed)) {
          return parsed;
        }
      } catch (error) {
        // Continue to next format
      }
    }

    // Fallback to native Date parsing
    try {
      const nativeDate = new Date(dateString);
      if (isValid(nativeDate)) {
        return nativeDate;
      }
    } catch (error) {
      // Return null if all parsing attempts fail
    }

    return null;
  }

  /**
   * Format date with custom format string using date-fns
   */
  private formatDateWithCustomFormat(date: Date, formatString: string, locale: string, timezone: string): string {
    try {
      // Use date-fns format function for robust formatting
      const result = format(date, formatString, { locale: undefined }); // Use default locale for now

      return result;
    } catch (error) {
      return date.toLocaleDateString(locale, { timeZone: timezone });
    }
  }
}
