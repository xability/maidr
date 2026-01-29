# Chart2Music Formatting System - Complete Technical Analysis

This document provides a comprehensive analysis of how chart2music implements value formatting for accessible data visualization. This serves as the reference for implementing similar functionality in MAIDR.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Type Definition](#core-type-definition)
3. [Default Format Function](#default-format-function)
4. [Format Wrapper Pattern](#format-wrapper-pattern)
5. [Axis Initialization](#axis-initialization)
6. [Point Description Generation](#point-description-generation)
7. [Translation Integration](#translation-integration)
8. [Complete Data Flow](#complete-data-flow)
9. [Usage Examples](#usage-examples)
10. [Key Design Decisions](#key-design-decisions)

---

## Architecture Overview

Chart2Music uses a **simple callback function pattern** for formatting values. The core philosophy is:

> **Users provide a function that takes a number and returns a string.**

This approach provides maximum flexibility with minimal API surface.

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Configuration                           │
│                                                                 │
│   axes: {                                                       │
│     x: { format: (value) => formatDate(value) },                │
│     y: { format: (value) => `$${value.toFixed(2)}` }            │
│   }                                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    initializeAxis()                             │
│   - Merges user format with defaults                            │
│   - Falls back to defaultFormat if not provided                 │
│   - Handles valueLabels array for categorical data              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    formatWrapper()                              │
│   - Wraps axis.format() with boundary checking                  │
│   - Handles NaN → "missing"                                     │
│   - Handles < minimum → "tooLow"                                │
│   - Handles > maximum → "tooHigh"                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 generatePointDescription()                      │
│   - Calls xFormat(point.x) and yFormat(point.y)                 │
│   - Assembles human-readable description                        │
│   - Passes to translationCallback for localization              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Screen Reader Output                         │
│   "January 15, $1,234.56"                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Type Definition

**File: `src/types.ts` (lines 127-136)**

```typescript
/**
 * Metadata for an axis
 */
export type AxisData = {
    minimum?: number;
    maximum?: number;
    label?: string;
    /* The formatter callback to format any number plotted against this axis */
    format?: (value: number) => string;
    type?: AxisScale;  // "linear" | "log10"
    valueLabels?: string[];
    continuous?: boolean;
};
```

### Key Points:

1. **`format` is optional** - If not provided, `defaultFormat` is used
2. **Simple signature**: `(value: number) => string`
3. **No configuration objects** - Just a function
4. **`valueLabels` alternative** - For categorical data, provide an array of labels indexed by value

---

## Default Format Function

**File: `src/utils.ts` (line 194)**

```typescript
export const defaultFormat = (value: number) => `${value}`;
```

This is the simplest possible formatter - it just converts the number to a string using template literals. No special formatting, no locale handling.

### Why This Design?

- **Zero assumptions** about what users want
- **No dependencies** on Intl or external libraries
- **Users opt-in** to formatting complexity
- **Predictable** behavior

---

## Format Wrapper Pattern

**File: `src/utils.ts` (lines 457-481)**

```typescript
export const formatWrapper = ({
    axis,
    translationCallback
}: {
    axis: AxisData;
    translationCallback: (
        code: string,
        evaluators?: translateEvaluators
    ) => string;
}) => {
    const format = (num: number) => {
        // Handle NaN values
        if (isNaN(num)) {
            return translationCallback("missing");
        }
        // Handle values below minimum
        if (typeof axis.minimum === "number" && num < axis.minimum) {
            return translationCallback("tooLow");
        }
        // Handle values above maximum
        if (typeof axis.maximum === "number" && num > axis.maximum) {
            return translationCallback("tooHigh");
        }
        // Normal case: delegate to axis format function
        return axis.format(num);
    };

    return format;
};
```

### What formatWrapper Does:

1. **Creates a higher-order function** that wraps the axis's format function
2. **Adds boundary checking** before calling the actual formatter
3. **Returns translated strings** for edge cases:
   - `NaN` → `"missing"` (translated)
   - `value < minimum` → `"tooLow"` (translated)
   - `value > maximum` → `"tooHigh"` (translated)
4. **Delegates to `axis.format()`** for normal values

### Translation Strings (src/translations/en.ts):

```typescript
{
    missing: "missing",
    tooLow: "too low",
    tooHigh: "too high",
    // ...
}
```

---

## Axis Initialization

**File: `src/utils.ts` (lines 377-406)**

```typescript
export const initializeAxis = ({
    data,
    axisName,
    userAxis,
    filterGroupIndex
}: {
    data: SupportedDataPointType[][];
    axisName: validAxes;
    userAxis?: AxisData;
    filterGroupIndex?: number;
}): AxisData => {
    // Determine format function with fallback chain
    const format =
        userAxis?.format ??                              // 1. User-provided format
        ("valueLabels" in userAxis                       // 2. valueLabels array
            ? (index) => userAxis.valueLabels[index]
            : defaultFormat);                            // 3. Default format

    return {
        minimum:
            userAxis?.minimum ??
            calculateAxisMinimum({ data, prop: axisName, filterGroupIndex }),
        maximum:
            userAxis?.maximum ??
            calculateAxisMaximum({ data, prop: axisName, filterGroupIndex }),
        label: userAxis?.label ?? "",
        type: userAxis?.type ?? "linear",
        format,
        continuous: userAxis.continuous ?? false
    };
};
```

### Format Resolution Priority:

1. **User-provided `format` function** - Highest priority
2. **`valueLabels` array** - For categorical/discrete data
3. **`defaultFormat`** - Fallback

### valueLabels Example:

```typescript
// User provides:
axes: {
    x: {
        valueLabels: ["Jan", "Feb", "Mar", "Apr", "May"]
    }
}

// When value is 2, format(2) returns "Mar"
```

---

## Point Description Generation

**File: `src/utils.ts` (lines 196-287)**

```typescript
export const generatePointDescription = ({
    point,
    xFormat = defaultFormat,
    yFormat = defaultFormat,
    stat,
    outlierIndex = null,
    announcePointLabelFirst = false,
    translationCallback
}: {
    point: SupportedDataPointType;
    xFormat?: AxisData["format"];
    yFormat?: AxisData["format"];
    stat?: keyof StatBundle;
    outlierIndex?: number | null;
    announcePointLabelFirst?: boolean;
    translationCallback: (
        code: string,
        evaluators?: translateEvaluators
    ) => string;
}) => {
    // Handle OHLC (Open, High, Low, Close) data points
    if (isOHLCDataPoint(point)) {
        if (typeof stat !== "undefined") {
            return translationCallback("point-xy", {
                x: xFormat(point.x),
                y: yFormat(point[stat as keyof OHLCDataPoint] as number)
            });
        }
        return translationCallback("point-xohlc", {
            x: xFormat(point.x),
            open: yFormat(point.open),
            high: yFormat(point.high),
            low: yFormat(point.low),
            close: yFormat(point.close)
        });
    }

    // Handle Box plot outliers
    if (isBoxDataPoint(point) && outlierIndex !== null) {
        return translationCallback("point-outlier", {
            x: xFormat(point.x),
            y: point.outlier.at(outlierIndex),
            index: outlierIndex + 1,
            count: point.outlier.length
        });
    }

    // Handle Box and HighLow data points
    if (isBoxDataPoint(point) || isHighLowDataPoint(point)) {
        if (typeof stat !== "undefined") {
            return translationCallback("point-xy", {
                x: xFormat(point.x),
                y: yFormat(point[stat])
            });
        }

        const { x, high, low } = point;
        const formattedPoint = {
            x: xFormat(x),
            high: yFormat(high),
            low: yFormat(low)
        };

        if ("outlier" in point && point.outlier?.length > 0) {
            return translationCallback("point-xhl-outlier", {
                ...formattedPoint,
                count: point.outlier.length
            });
        }

        return translationCallback("point-xhl", formattedPoint);
    }

    // Handle Simple data points (most common case)
    if (isSimpleDataPoint(point)) {
        const details = [xFormat(point.x), yFormat(point.y)];
        if (point.label) {
            if (announcePointLabelFirst) {
                details.unshift(point.label);
            } else {
                details.push(point.label);
            }
        }
        return details.join(", ");
    }

    // Handle Alternate axis data points
    if (isAlternateAxisDataPoint(point)) {
        return translationCallback("point-xy", {
            x: xFormat(point.x),
            y: yFormat(point.y2)
        });
    }

    return "";
};
```

### Translation Templates:

```typescript
{
    "point-xy": "{x}, {y}",
    "point-xohlc": "{x}, {open} - {high} - {low} - {close}",
    "point-outlier": "{x}, {y}, {index} of {count}",
    "point-xhl": "{x}, {high} - {low}",
    "point-xhl-outlier": `{x}, {high} - {low}, with {count, plural,
        =0 {no outliers}
        one {{count} outlier}
        other {{count} outliers}
    }`,
}
```

---

## Translation Integration

**File: `src/translations/en.ts`**

Chart2Music uses ICU MessageFormat for internationalization. The translation system:

1. **Supports pluralization**: `{count, plural, one {...} other {...}}`
2. **Variable interpolation**: `{x}`, `{y}`, `{title}`
3. **Fallback to English**: If translation not found

### How it connects to formatting:

```typescript
// In c2mChart.ts (lines 2374-2396)
const point = generatePointDescription({
    translationCallback: (code, evaluators) => {
        return this._translator.translate(code, evaluators);
    },
    point: current,
    xFormat: formatWrapper({
        axis: this._xAxis,
        translationCallback: (code, evaluators) => {
            return this._translator.translate(code, evaluators);
        }
    }),
    yFormat: formatWrapper({
        translationCallback: (code, evaluators) => {
            return this._translator.translate(code, evaluators);
        },
        axis: isAlternateAxisDataPoint(current)
            ? this._y2Axis
            : this._yAxis
    }),
    // ...
});
```

---

## Complete Data Flow

### 1. User Provides Configuration

```typescript
const chart = c2mChart({
    type: "line",
    data: salesData,
    element: chartElement,
    axes: {
        x: {
            label: "Month",
            format: (value) => {
                const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
                return months[value] || `Month ${value}`;
            }
        },
        y: {
            label: "Revenue",
            format: (value) => {
                return new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD'
                }).format(value);
            }
        }
    }
});
```

### 2. Chart Initialization (c2mChart.ts)

```typescript
// Lines 843-861 in _setData()
this._xAxis = initializeAxis({
    data: this._data,
    axisName: "x",
    userAxis: this._explicitAxes.x,  // Contains user's format function
    filterGroupIndex: this._groups.indexOf(this._options.root)
});
this._yAxis = initializeAxis({
    data: this._data,
    axisName: "y",
    userAxis: this._explicitAxes.y,  // Contains user's format function
    filterGroupIndex: this._groups.indexOf(this._options.root)
});
```

### 3. User Navigates to a Data Point

```typescript
// Lines 2357-2417 in _speakCurrent()
private _speakCurrent(current: SupportedDataPointType) {
    const point = generatePointDescription({
        point: current,
        xFormat: formatWrapper({
            axis: this._xAxis,  // Has user's format function
            translationCallback: (code, evaluators) => {
                return this._translator.translate(code, evaluators);
            }
        }),
        yFormat: formatWrapper({
            axis: this._yAxis,  // Has user's format function
            translationCallback: (code, evaluators) => {
                return this._translator.translate(code, evaluators);
            }
        }),
        // ...
    });

    this._sr.render(point);  // Speaks: "March, $1,234.56"
}
```

### 4. Output

Screen reader announces: **"March, $1,234.56"**

---

## Usage Examples

### Example 1: Date Formatting

```typescript
c2mChart({
    type: "line",
    data: [
        { x: 1704067200000, y: 100 },  // Jan 1, 2024
        { x: 1706745600000, y: 150 },  // Feb 1, 2024
    ],
    element: chartEl,
    axes: {
        x: {
            label: "Date",
            format: (timestamp) => {
                return new Date(timestamp).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });
            }
        }
    }
});
// Output: "Jan 1, 2024, 100"
```

### Example 2: Currency Formatting

```typescript
c2mChart({
    type: "bar",
    data: [10000, 25000, 15000],
    element: chartEl,
    axes: {
        y: {
            label: "Sales",
            format: (value) => {
                return new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 0
                }).format(value);
            }
        }
    }
});
// Output: "0, $10,000"
```

### Example 3: Percentage Formatting

```typescript
c2mChart({
    type: "pie",
    data: [0.35, 0.25, 0.40],
    element: chartEl,
    axes: {
        y: {
            label: "Share",
            format: (value) => `${(value * 100).toFixed(1)}%`
        }
    }
});
// Output: "0, 35.0%"
```

### Example 4: Categorical Labels (valueLabels)

```typescript
c2mChart({
    type: "bar",
    data: [100, 200, 150, 300],
    element: chartEl,
    axes: {
        x: {
            label: "Quarter",
            valueLabels: ["Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024"]
        }
    }
});
// Output: "Q1 2024, 100"
```

### Example 5: Scientific Notation

```typescript
c2mChart({
    type: "scatter",
    data: [
        { x: 0.00001, y: 1000000 },
        { x: 0.00002, y: 2000000 },
    ],
    element: chartEl,
    axes: {
        x: {
            format: (v) => v.toExponential(2)  // "1.00e-5"
        },
        y: {
            format: (v) => v.toExponential(2)  // "1.00e+6"
        }
    }
});
```

---

## Key Design Decisions

### 1. Callback Functions over Configuration Objects

**Chart2Music chose:**
```typescript
format: (value: number) => string
```

**Instead of:**
```typescript
format: {
    type: 'currency',
    currency: 'USD',
    decimals: 2
}
```

**Reasons:**
- Maximum flexibility
- No need to anticipate all use cases
- Users bring their own formatting libraries
- Smaller API surface
- No dependencies

### 2. Format Wrapper for Edge Cases

Rather than requiring users to handle NaN/boundary cases, chart2music wraps their formatter:

```typescript
const wrappedFormat = formatWrapper({
    axis: { format: userFormat, minimum, maximum },
    translationCallback
});
```

**Benefits:**
- Users write clean formatters
- Edge cases handled consistently
- Internationalized error messages

### 3. Translation Separation

Formatting and translation are separate concerns:

- **Formatting**: `(number) => string` - How to display a value
- **Translation**: Message templates with interpolation - How to compose output

This allows:
- Same format function works in all languages
- Translated messages can change without affecting formatters

### 4. No External Dependencies

Chart2Music uses:
- Native JavaScript template literals for `defaultFormat`
- Users can use `Intl.NumberFormat`, `date-fns`, etc. in their format functions
- No bundled formatting library

---

## Summary: What to Adopt for MAIDR

### Core Principles to Follow:

1. **Simple callback signature**: `format: (value: number | string) => string`
2. **Default formatter**: Just stringify the value
3. **Wrapper pattern**: Handle NaN, boundary conditions separately
4. **User brings complexity**: Don't bundle date-fns, let users choose
5. **Integration with existing TextService**: Apply formatters when generating descriptions

### Recommended Type Definition for MAIDR:

```typescript
interface AxisFormat {
  /** User-provided formatter function */
  format?: (value: number | string) => string;
  /** Alternative: array of labels for categorical data */
  valueLabels?: string[];
}

interface MaidrLayer {
  // ... existing fields ...
  axes?: {
    x?: string;
    y?: string;
    xFormat?: AxisFormat;
    yFormat?: AxisFormat;
  };
}
```

### Optional Utility Helpers:

```typescript
// src/util/formatters.ts
export const formatters = {
  currency: (currency = 'USD', decimals = 2) =>
    (value: number) => new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals
    }).format(value),

  percent: (decimals = 1) =>
    (value: number) => `${(value * 100).toFixed(decimals)}%`,

  date: (options?: Intl.DateTimeFormatOptions) =>
    (value: number | string) =>
      new Intl.DateTimeFormat('en-US', options).format(new Date(value)),

  default: (value: number | string) => `${value}`
};
```

---

## References

- **Repository**: https://github.com/julianna-langston/chart2music
- **Source Files Analyzed**:
  - `src/types.ts` - Type definitions
  - `src/utils.ts` - Formatting functions
  - `src/c2mChart.ts` - Main chart class
  - `src/translations/en.ts` - Translation strings
