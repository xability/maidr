# MAIDR Formatting Feature - Design Proposal

Based on the chart2music formatting analysis, this document outlines how to implement custom value formatting in MAIDR following the same proven patterns.

---

## Overview

Implement a simple, flexible value formatting system that allows users to customize how data values are displayed in text descriptions and braille output.

### Goals

1. **Simplicity**: Callback function signature `(value) => string`
2. **Flexibility**: Users control all formatting logic
3. **No new dependencies**: Use native `Intl` APIs
4. **Backward compatible**: Existing MAIDR data works without changes
5. **Consistent**: Same patterns for all plot types

---

## Proposed Changes

### 1. Type Definitions (`src/type/grammar.ts`)

Add formatting types to the grammar:

```typescript
/**
 * Format function signature for axis values
 */
export type FormatFunction = (value: number | string) => string;

/**
 * Axis format configuration
 */
export interface AxisFormat {
  /**
   * Custom formatter function.
   * Takes a value and returns a formatted string.
   * @example
   * format: (value) => `$${value.toFixed(2)}`
   */
  format?: FormatFunction;

  /**
   * Array of labels for categorical/discrete data.
   * Index maps to value (e.g., valueLabels[0] for value 0)
   */
  valueLabels?: string[];
}

/**
 * Update MaidrLayer to include axis formatting
 */
export interface MaidrLayer {
  // ... existing fields ...

  /**
   * Axis format configuration
   */
  format?: {
    x?: AxisFormat;
    y?: AxisFormat;
  };
}
```

### 2. Create Format Utilities (`src/util/format.ts`)

New utility module for formatting helpers:

```typescript
import type { AxisFormat, FormatFunction } from '@type/grammar';

/**
 * Default formatter - converts value to string
 */
export const defaultFormat: FormatFunction = (value) => `${value}`;

/**
 * Creates a format function from AxisFormat configuration
 */
export function resolveFormat(axisFormat?: AxisFormat): FormatFunction {
  if (!axisFormat) {
    return defaultFormat;
  }

  // Priority 1: User-provided format function
  if (axisFormat.format) {
    return axisFormat.format;
  }

  // Priority 2: valueLabels array for categorical data
  if (axisFormat.valueLabels) {
    return (value: number | string) => {
      const index = typeof value === 'number' ? value : parseInt(value, 10);
      return axisFormat.valueLabels?.[index] ?? `${value}`;
    };
  }

  // Fallback: default format
  return defaultFormat;
}

/**
 * Wraps a format function with edge case handling
 * Similar to chart2music's formatWrapper
 */
export function wrapFormat(
  format: FormatFunction,
  options?: {
    minimum?: number;
    maximum?: number;
    missingText?: string;
    tooLowText?: string;
    tooHighText?: string;
  }
): FormatFunction {
  const {
    minimum,
    maximum,
    missingText = 'missing',
    tooLowText = 'below range',
    tooHighText = 'above range',
  } = options ?? {};

  return (value: number | string): string => {
    const numValue = typeof value === 'number' ? value : parseFloat(value);

    // Handle NaN
    if (isNaN(numValue)) {
      return missingText;
    }

    // Handle boundary conditions
    if (minimum !== undefined && numValue < minimum) {
      return tooLowText;
    }
    if (maximum !== undefined && numValue > maximum) {
      return tooHighText;
    }

    // Normal case: use the format function
    return format(value);
  };
}

/**
 * Pre-built formatter factories for common use cases
 */
export const formatters = {
  /**
   * Currency formatter
   * @example formatters.currency('USD', 2)(1234.5) // "$1,234.50"
   */
  currency: (currency = 'USD', decimals = 2, locale = 'en-US'): FormatFunction =>
    (value: number | string) => {
      const num = typeof value === 'number' ? value : parseFloat(value);
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(num);
    },

  /**
   * Percentage formatter
   * @example formatters.percent(1)(0.156) // "15.6%"
   */
  percent: (decimals = 1): FormatFunction =>
    (value: number | string) => {
      const num = typeof value === 'number' ? value : parseFloat(value);
      return `${(num * 100).toFixed(decimals)}%`;
    },

  /**
   * Date formatter
   * @example formatters.date({ month: 'short', year: 'numeric' })(1704067200000)
   */
  date: (options?: Intl.DateTimeFormatOptions, locale = 'en-US'): FormatFunction =>
    (value: number | string) => {
      const date = new Date(value);
      return new Intl.DateTimeFormat(locale, options).format(date);
    },

  /**
   * Number formatter with grouping
   * @example formatters.number(2)(1234567.89) // "1,234,567.89"
   */
  number: (decimals = 0, locale = 'en-US'): FormatFunction =>
    (value: number | string) => {
      const num = typeof value === 'number' ? value : parseFloat(value);
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(num);
    },

  /**
   * Scientific notation
   * @example formatters.scientific(2)(1234567) // "1.23e+6"
   */
  scientific: (decimals = 2): FormatFunction =>
    (value: number | string) => {
      const num = typeof value === 'number' ? value : parseFloat(value);
      return num.toExponential(decimals);
    },
};
```

### 3. Update TextService (`src/service/text.ts`)

Integrate formatting into the existing TextService:

```typescript
import { resolveFormat, wrapFormat, defaultFormat } from '@util/format';
import type { FormatFunction } from '@type/grammar';

export class TextService implements Observer<PlotState>, Disposable {
  // Add format function references
  private xFormat: FormatFunction = defaultFormat;
  private yFormat: FormatFunction = defaultFormat;

  /**
   * Initialize formatters from layer configuration
   */
  public initializeFormatters(layer: MaidrLayer): void {
    this.xFormat = wrapFormat(
      resolveFormat(layer.format?.x),
      { missingText: 'missing value' }
    );
    this.yFormat = wrapFormat(
      resolveFormat(layer.format?.y),
      { missingText: 'missing value' }
    );
  }

  /**
   * Format x-axis value
   */
  public formatX(value: number | string): string {
    return this.xFormat(value);
  }

  /**
   * Format y-axis value
   */
  public formatY(value: number | string): string {
    return this.yFormat(value);
  }

  // Update existing methods to use formatters
  // In the methods that generate text descriptions, replace
  // direct value usage with this.formatX(value) / this.formatY(value)
}
```

### 4. Update Controller Integration (`src/controller.ts`)

Initialize formatters when creating the TextService:

```typescript
// In Controller constructor or initialization
const layer = this.figure.getCurrentLayer();
this.textService.initializeFormatters(layer);

// When switching layers/traces
private onLayerChange(layer: MaidrLayer): void {
  this.textService.initializeFormatters(layer);
}
```

### 5. Update Trace Models

Each trace model should expose formatting configuration:

```typescript
// In trace model (e.g., src/model/bar.ts)
export class BarTrace extends AbstractPlot<BarTraceState> {
  private xFormat: FormatFunction;
  private yFormat: FormatFunction;

  constructor(layer: MaidrLayer, /* ... */) {
    // ...
    this.xFormat = resolveFormat(layer.format?.x);
    this.yFormat = resolveFormat(layer.format?.y);
  }

  // Use formatters when generating state
  get state(): BarTraceState {
    return {
      // ...
      text: {
        x: this.xFormat(this.currentX),
        y: this.yFormat(this.currentY),
        // ...
      }
    };
  }
}
```

---

## Usage Examples

### Example 1: Financial Candlestick Chart

```javascript
const maidrData = {
  type: "candlestick",
  data: [
    { x: "2024-01-15", open: 150.25, high: 155.80, low: 148.90, close: 154.50 },
    // ...
  ],
  format: {
    x: {
      format: (value) => new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
    },
    y: {
      format: (value) => `$${value.toFixed(2)}`
    }
  }
};
```

**Output**: "Jan 15, Open: $150.25, High: $155.80, Low: $148.90, Close: $154.50"

### Example 2: Bar Chart with Categories

```javascript
const maidrData = {
  type: "bar",
  data: [
    { x: 0, y: 1200000 },
    { x: 1, y: 980000 },
    { x: 2, y: 1450000 },
    { x: 3, y: 890000 },
  ],
  format: {
    x: {
      valueLabels: ["Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024"]
    },
    y: {
      format: (value) => new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact'
      }).format(value)
    }
  }
};
```

**Output**: "Q1 2024, $1.2M"

### Example 3: Using Built-in Formatters

```javascript
import { formatters } from 'maidr/util/format';

const maidrData = {
  type: "scatter",
  data: scatterPoints,
  format: {
    x: { format: formatters.date({ month: 'short', year: 'numeric' }) },
    y: { format: formatters.currency('EUR', 0) }
  }
};
```

### Example 4: Percentage Data

```javascript
const maidrData = {
  type: "bar",
  data: marketShareData,
  format: {
    y: { format: formatters.percent(1) }
  }
};
```

**Output**: "Apple, 35.2%"

---

## Implementation Plan

### Phase 1: Core Types and Utilities
1. Add `FormatFunction` and `AxisFormat` types to `grammar.ts`
2. Create `src/util/format.ts` with:
   - `defaultFormat`
   - `resolveFormat`
   - `wrapFormat`
   - `formatters` object

### Phase 2: TextService Integration
1. Add format function properties to TextService
2. Add `initializeFormatters()` method
3. Add `formatX()` and `formatY()` helper methods
4. Update text generation methods to use formatters

### Phase 3: Controller Integration
1. Call `textService.initializeFormatters()` during initialization
2. Handle layer/trace changes

### Phase 4: Trace Model Updates
1. Update each trace type to accept format configuration
2. Apply formatters when generating state

### Phase 5: Documentation and Examples
1. Update type documentation
2. Create usage examples
3. Update candlestick example with formatting

---

## Migration from Draft PR

The draft PR (`feat/custom-formatting`) introduced:
- `DataFormattingService` class
- Complex configuration objects
- `date-fns` dependency

**Key changes in this proposal:**

| Aspect | Draft PR | New Proposal |
|--------|----------|--------------|
| API Style | Config objects | Callback functions |
| Dependencies | date-fns | None (use Intl) |
| Complexity | High | Low |
| Flexibility | Limited to presets | Unlimited |
| Bundle size | +date-fns (~60KB) | Minimal |
| Files changed | 9 files | ~5 files |

---

## Backward Compatibility

- Existing MAIDR data without `format` field works unchanged
- `defaultFormat` ensures values display as before
- No breaking changes to existing API

---

## Testing Strategy

1. **Unit tests for format utilities**
   - `defaultFormat` returns string
   - `resolveFormat` priority chain
   - `wrapFormat` edge case handling
   - Each built-in formatter

2. **Integration tests**
   - TextService with custom formatters
   - Trace models with formatting
   - Full flow from data to screen reader

3. **E2E tests**
   - Candlestick with date/price formatting
   - Bar chart with categorical labels
   - Various edge cases (NaN, boundaries)
