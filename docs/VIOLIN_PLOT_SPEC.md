# Violin Plot — Frontend Specification & Backend Data Contract

> **Audience**: Python backend / binder developers producing MAIDR JSON for violin plots.
> **Branch**: `violin_plot_maidr`
> **Last updated**: 2026-03-03

---

## Table of Contents

1. [Overview](#1-overview)
2. [Top-Level MAIDR Structure](#2-top-level-maidr-structure)
3. [Layer Configuration (MaidrLayer)](#3-layer-configuration-maidrlayer)
4. [KDE Layer — `violin_kde`](#4-kde-layer--violin_kde)
5. [Box Layer — `violin_box`](#5-box-layer--violin_box)
6. [ViolinOptions — Conditional Display](#6-violinoptions--conditional-display)
7. [SVG Selector Contract](#7-svg-selector-contract)
8. [Navigation Behavior](#8-navigation-behavior)
9. [Audio Behavior](#9-audio-behavior)
10. [Text Output (Screen Reader)](#10-text-output-screen-reader)
11. [Braille Output](#11-braille-output)
12. [Layer Switching](#12-layer-switching)
13. [Orientation Support](#13-orientation-support)
14. [Complete JSON Example](#14-complete-json-example)
15. [Field Reference Tables](#15-field-reference-tables)
16. [Checklist for Backend Implementation](#16-checklist-for-backend-implementation)

---

## 1. Overview

A violin plot in MAIDR is represented as **two layers** inside a single subplot:

| Layer | `type` value | Purpose | Trace Class |
|-------|-------------|---------|-------------|
| **Box overlay** | `"violin_box"` | Summary statistics (min, Q1, median, Q3, max, mean, outliers) | `ViolinBoxTrace` |
| **KDE curve** | `"violin_kde"` | The density (kernel density estimate) outline of each violin | `ViolinKdeTrace` |

Both layers share the same subplot. The user navigates within one layer at a time and can switch between them with `PageUp`/`PageDown`.

### Layer Order (Important)

The **first layer in the `layers` array is the default view** shown when the user enters the plot. The frontend does not reorder layers — it uses the JSON array order directly.

**Recommended order**: Put `violin_box` first so users start with the box plot summary, then switch to `violin_kde` for density details. This gives users the statistical overview first before exploring the full density curve.

### What Changed From Previous Implementation

| Aspect | Old (main branch) | New (this branch) |
|--------|-------------------|-------------------|
| Trace types | `"smooth"` + `"box"` with heuristic detection (BOX+SMOOTH in same subplot = violin) | Explicit `"violin_kde"` + `"violin_box"` types |
| Detection | Structural heuristic in Subplot constructor | Direct type matching in TraceFactory |
| Box sections | Standard box used Q1/Q3 always; violin box skipped them | ViolinBoxTrace always includes Q1/Q3, conditionally includes Q2/MEAN |
| Data format | SmoothPoint (`{x, y, svg_x, svg_y}`) | ViolinKdePoint (`{x, y, density?, width?, svg_x?, svg_y?}`) |
| Factory | `isViolinPlot` flag passed to factory | No flag needed — type string drives creation |

---

## 2. Top-Level MAIDR Structure

```json
{
  "id": "unique-chart-id",
  "title": "Diamond Price Distribution by Cut Quality",
  "subplots": [
    [
      {
        "layers": [
          { "type": "violin_box", ... },
          { "type": "violin_kde", ... }
        ]
      }
    ]
  ]
}
```

**Rules:**
- Both layers MUST be in the same subplot `layers` array.
- **Put `violin_box` first** so it is the default layer shown to the user.
- Layer order determines default view — the frontend uses `type` to dispatch, not position.
- The `id` at the root level is used for DOM element identification.

---

## 3. Layer Configuration (MaidrLayer)

Each layer object has these fields:

```typescript
{
  "id": string,                    // Unique layer ID
  "type": "violin_kde" | "violin_box",
  "title"?: string,                // Optional plot title
  "orientation"?: "vert" | "horz", // Default: "vert"
  "axes"?: {
    "x"?: string,                  // X-axis label (e.g., "Cut Quality")
    "y"?: string,                  // Y-axis label (e.g., "Price (USD)")
    "fill"?: string,               // Fill axis label (rarely used for violin)
    "format"?: { ... }             // Optional value formatting config
  },
  "selectors"?: ...,               // SVG CSS selectors (see Section 7)
  "violinOptions"?: { ... },       // Only for violin_box (see Section 6)
  "data": ...                      // Layer-specific data (see Sections 4 & 5)
}
```

---

## 4. KDE Layer — `violin_kde`

### 4.1 Data Format

The `data` field is a **2D array**: `ViolinKdePoint[][]`

```
data[violinIndex][curvePosition] = ViolinKdePoint
```

- **Outer array**: One sub-array per violin group (e.g., 5 violins = 5 sub-arrays).
- **Inner array**: Points along the KDE curve for that violin, ordered from bottom to top of the curve.

### 4.2 ViolinKdePoint Fields

```typescript
{
  "x": string | number,   // REQUIRED — Categorical label (e.g., "Ideal", "Premium")
  "y": number,            // REQUIRED — Position along density axis (numeric)
  "density"?: number,     // OPTIONAL — KDE density value at this point
  "width"?: number,       // OPTIONAL — Half-width of violin (density fallback)
  "svg_x"?: number,       // OPTIONAL — SVG viewport X coordinate for highlighting
  "svg_y"?: number        // OPTIONAL — SVG viewport Y coordinate for highlighting
}
```

### 4.3 Field Behavior & Fallbacks

| Field | Required | Fallback | Notes |
|-------|----------|----------|-------|
| `x` | YES | — | Same value for all points in a violin. Used for text labels. |
| `y` | YES | — | Monotonically increasing along the curve (bottom to top). |
| `density` | NO | `width` | Primary density value. If absent, `width` is used. |
| `width` | NO | `0` | Used only when `density` is absent. Legacy format support. |
| `svg_x` | NO | Skip highlight | If missing or `NaN`, no highlight circle is created for that point. |
| `svg_y` | NO | Skip highlight | Must be paired with `svg_x` for highlighting to work. |

**Density Resolution Chain:**
```
effectiveDensity = point.density ?? point.width ?? 0
```

### 4.4 Point Pairing (Full Violin Outline)

The data typically has **paired left/right sides** of the violin at each Y level (e.g., 198 points for a 99-Y-level grid):

```
Index 0: { x: "Ideal", y: -501.7, svg_x: 100.41, svg_y: 281.84, width: 0.044 }  // LEFT side
Index 1: { x: "Ideal", y: -501.7, svg_x: 103.84, svg_y: 281.84, width: 0.044 }  // RIGHT side
Index 2: { x: "Ideal", y: -294.2, svg_x: 98.25,  svg_y: 279.41, width: 0.100 }  // LEFT side
Index 3: { x: "Ideal", y: -294.2, svg_x: 105.99, svg_y: 279.41, width: 0.100 }  // RIGHT side
...
```

**IMPORTANT**: Do NOT deduplicate these pairs. The navigation traverses both sides of the curve (up the left side, down the right side). Deduplicating would break navigation — the user would only traverse one side.

### 4.5 Example KDE Layer

```json
{
  "id": "kde-layer-1",
  "type": "violin_kde",
  "title": "Diamond Price Distribution by Cut Quality",
  "axes": {
    "x": "Cut Quality",
    "y": "Price (USD)"
  },
  "selectors": [
    "g.violins > g:nth-child(1)",
    "g.violins > g:nth-child(2)",
    "g.violins > g:nth-child(3)"
  ],
  "data": [
    [
      { "x": "Ideal", "y": -501.7, "svg_x": 100.41, "svg_y": 281.84, "width": 0.044 },
      { "x": "Ideal", "y": -501.7, "svg_x": 103.84, "svg_y": 281.84, "width": 0.044 },
      { "x": "Ideal", "y": -294.2, "svg_x": 98.25,  "svg_y": 279.41, "width": 0.100 },
      { "x": "Ideal", "y": -294.2, "svg_x": 105.99, "svg_y": 279.41, "width": 0.100 }
    ],
    [
      { "x": "Premium", "y": -400.0, "svg_x": 200.0, "svg_y": 270.0, "width": 0.035 },
      { "x": "Premium", "y": -400.0, "svg_x": 205.0, "svg_y": 270.0, "width": 0.035 }
    ]
  ]
}
```

### 4.6 Selectors for KDE Layer

Selectors can be:
- **One per violin**: `string[]` with `length === data.length`
- **Single pattern**: `string[]` with `length === 1` (matched against all violins)

The frontend resolves SVG elements from each selector, preferring `<use>` reference elements and falling back to `<path>` geometry elements. Circle highlight elements are then created at `(svg_x, svg_y)` positions.

---

## 5. Box Layer — `violin_box`

### 5.1 Data Format

The `data` field is a **1D array**: `BoxPoint[]`

```
data[violinIndex] = BoxPoint
```

One `BoxPoint` per violin group.

### 5.2 BoxPoint Fields

```typescript
{
  "fill": string,            // REQUIRED — Category label (e.g., "Ideal")
  "lowerOutliers": number[], // REQUIRED — Lower outlier values (can be [])
  "min": number,             // REQUIRED — Minimum (whisker bottom)
  "q1": number,              // REQUIRED — 25th percentile
  "q2": number,              // REQUIRED — 50th percentile (median)
  "q3": number,              // REQUIRED — 75th percentile
  "max": number,             // REQUIRED — Maximum (whisker top)
  "upperOutliers": number[], // REQUIRED — Upper outlier values (can be [])
  "mean"?: number            // OPTIONAL — Mean value
}
```

### 5.3 Field Details

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `fill` | YES | `string` | Categorical label. Displayed in text mode as main axis value. |
| `lowerOutliers` | YES | `number[]` | Can be empty `[]`. Each value is an outlier below the whisker. |
| `min` | YES | `number` | Minimum value (lower whisker endpoint). |
| `q1` | YES | `number` | First quartile (25th percentile). |
| `q2` | YES | `number` | Median (50th percentile). |
| `q3` | YES | `number` | Third quartile (75th percentile). |
| `max` | YES | `number` | Maximum value (upper whisker endpoint). |
| `upperOutliers` | YES | `number[]` | Can be empty `[]`. Each value is an outlier above the whisker. |
| `mean` | NO | `number` | Only needed if `violinOptions.showMean` is `true`. Frontend handles missing/NaN gracefully. |

### 5.4 Example Box Layer

```json
{
  "id": "box-layer-1",
  "type": "violin_box",
  "axes": {
    "x": "Cut Quality",
    "y": "Price (USD)"
  },
  "violinOptions": {
    "showMedian": true,
    "showMean": false,
    "showExtrema": true
  },
  "selectors": [
    {
      "lowerOutliers": ["g.box1 circle.lower-outlier"],
      "min": "g.box1 line.whisker-min",
      "iq": "g.box1 rect.iqr-box",
      "q2": "g.box1 line.median",
      "max": "g.box1 line.whisker-max",
      "upperOutliers": ["g.box1 circle.upper-outlier"],
      "mean": "g.box1 line.mean"
    },
    {
      "lowerOutliers": [],
      "min": "g.box2 line.whisker-min",
      "iq": "g.box2 rect.iqr-box",
      "q2": "g.box2 line.median",
      "max": "g.box2 line.whisker-max",
      "upperOutliers": ["g.box2 circle.upper-outlier"]
    }
  ],
  "data": [
    {
      "fill": "Ideal",
      "lowerOutliers": [18806],
      "min": 326,
      "q1": 878,
      "q2": 1810,
      "q3": 4678,
      "max": 18806,
      "upperOutliers": []
    },
    {
      "fill": "Premium",
      "lowerOutliers": [],
      "min": 326,
      "q1": 1046,
      "q2": 3185,
      "q3": 6296,
      "max": 18823,
      "upperOutliers": []
    }
  ]
}
```

---

## 6. ViolinOptions — Conditional Display

The `violinOptions` field on the `violin_box` layer controls which summary statistics are navigable.

```typescript
{
  "showMedian"?: boolean,    // Default: true  — Include Q2 (50%) section
  "showMean"?: boolean,      // Default: false — Include Mean section
  "showExtrema"?: boolean,   // Default: true  — Include MIN and MAX sections
  "showOutliers"?: boolean   // Default: true  — Include outlier sections
}
```

### Section Build Order

The navigable sections are built in this fixed order, with conditional items skipped:

| # | Section | Label | Condition | Always? |
|---|---------|-------|-----------|---------|
| 0 | LOWER_OUTLIER | `"Lower outlier(s)"` | — | YES |
| 1 | MIN | `"Minimum"` | — | YES |
| 2 | Q1 | `"25%"` | — | YES |
| 3 | Q2 | `"50%"` | `showMedian !== false` | Default YES |
| 4 | MEAN | `"Mean"` | `showMean === true` | Default NO |
| 5 | Q3 | `"75%"` | — | YES |
| 6 | MAX | `"Maximum"` | `showExtrema !== false` | Default YES |
| 7 | UPPER_OUTLIER | `"Upper outlier(s)"` | — | YES |

**Notes:**
- Q1 and Q3 are ALWAYS included (core quartile statistics).
- MEAN is only included when explicitly enabled (`showMean: true`).
- Section indices shift when optional sections are excluded.
- The MIN section index is cached internally for navigation reset.

### Defaults When `violinOptions` Is Omitted

If `violinOptions` is not provided at all, the default `{}` is used, which means:
- `showMedian` defaults to `true` — Q2 included
- `showMean` defaults to `false` — MEAN excluded
- `showExtrema` defaults to `true` — MIN/MAX included
- `showOutliers` defaults to `true` — Outlier sections included

Resulting default section order:
`LOWER_OUTLIER -> MIN -> Q1 -> Q2 -> Q3 -> MAX -> UPPER_OUTLIER` (7 sections)

---

## 7. SVG Selector Contract

### 7.1 KDE Layer Selectors

**Type:** `string | string[]`

| Format | Meaning |
|--------|---------|
| `string[]` with `length === data.length` | One CSS selector per violin |
| `string[]` with `length === 1` | Single pattern matched for all violins |
| `string` | Single selector string |

**Element Resolution:**
1. Query DOM with selector
2. Prefer `<use>` reference elements
3. Fallback to `<path>` geometry elements
4. Create `<circle>` highlight elements at each point's `(svg_x, svg_y)`

### 7.2 Box Layer Selectors

**Type:** `BoxSelector[]` with `length === data.length` (one per violin)

```typescript
{
  "lowerOutliers": string[],  // CSS selectors for outlier circles below whisker
  "min": string,              // CSS selector for minimum whisker line
  "iq": string,               // CSS selector for IQ box rectangle (Q1-Q3 range)
  "q2": string,               // CSS selector for median line
  "max": string,              // CSS selector for maximum whisker line
  "upperOutliers": string[],  // CSS selectors for outlier circles above whisker
  "mean"?: string             // CSS selector for mean marker (only if showMean)
}
```

**Critical: The `iq` field**
The IQ box (`iq`) is a `<rect>` SVG element spanning Q1 to Q3. The frontend extracts Q1/Q3 highlight positions from it:
- **Vertical orientation**: Q1 = bottom edge, Q3 = top edge
- **Horizontal orientation**: Q1 = left edge, Q3 = right edge

The frontend calls `Svg.createLineElement(iqElement, 'bottom')` and `Svg.createLineElement(iqElement, 'top')` to create line elements at the edges.

**Selector Array Requirements:**
- `lowerOutliers` and `upperOutliers` can be empty arrays `[]` when no outliers exist.
- `mean` is optional — only required if `violinOptions.showMean` is `true`.
- All other fields are required strings (CSS selectors).

---

## 8. Navigation Behavior

### 8.1 KDE Layer Navigation

| Key | Direction | Action |
|-----|-----------|--------|
| Left | BACKWARD | Move to previous violin. Reset to bottom of curve (col=0). |
| Right | FORWARD | Move to next violin. Reset to bottom of curve (col=0). |
| Up | UPWARD | Move to next point along KDE curve (col+1). |
| Down | DOWNWARD | Move to previous point along KDE curve (col-1). |
| Ctrl+Left | BACKWARD extreme | Jump to first violin. |
| Ctrl+Right | FORWARD extreme | Jump to last violin. |
| Ctrl+Up | UPWARD extreme | Jump to top of curve. |
| Ctrl+Down | DOWNWARD extreme | Jump to bottom of curve. |
| PageUp | — | Switch to violin_box layer (preserves position). |
| PageDown | — | Switch to violin_box layer (preserves position). |

**Boundary behavior:** At boundaries, the user hears an out-of-bounds notification and position does not change.

### 8.2 Box Layer Navigation

**Vertical orientation (default):**

| Key | Direction | Action |
|-----|-----------|--------|
| Left | BACKWARD | Move to previous violin. Reset to MIN section. |
| Right | FORWARD | Move to next violin. Reset to MIN section. |
| Up | UPWARD | Move to next section (e.g., MIN -> Q1 -> Q2 -> ...). |
| Down | DOWNWARD | Move to previous section (e.g., Q2 -> Q1 -> MIN -> ...). |
| PageUp/Down | — | Switch to violin_kde layer (preserves position). |

**Horizontal orientation:**

| Key | Direction | Action |
|-----|-----------|--------|
| Up | UPWARD | Move to next violin. Reset to MIN section. |
| Down | DOWNWARD | Move to previous violin. Reset to MIN section. |
| Left | BACKWARD | Move to previous section. |
| Right | FORWARD | Move to next section. |

**Initial entry:** When first entering the box layer, navigation starts at the MIN section (not LOWER_OUTLIER).

---

## 9. Audio Behavior

### 9.1 KDE Layer Audio

**Pitch (frequency):**
- Based on **reference violin** (first violin, index 0) density values.
- All violins use the same pitch scale so relative density is comparable.
- Provides `[prevDensity, currentDensity, nextDensity]` as raw frequency array for smooth transitions.
- Min/max frequency derived from reference violin's positive density values.

**Volume:**
- Based on **current violin's** own density, normalized per-violin.
- `volumeScale = currentDensity / maxDensityOfCurrentViolin`
- Louder at wider parts of the violin, quieter at narrow parts.

**Panning:**
- Horizontal position reflects which violin (left=first, right=last).
- Vertical position reflects position along curve.

**Continuous mode:** `isContinuous: true` — audio plays as a smooth tone, not discrete beeps.

### 9.2 Box Layer Audio

**Pitch (frequency):**
- `min`/`max` derived from global min/max of all box values across all violins (NaN excluded).
- `raw` is the current section value (single number or array for outliers).

**Panning:**
- Orientation-dependent mapping of violin index and section value.

---

## 10. Text Output (Screen Reader)

### 10.1 KDE Layer Text

**Verbose mode:**
```
Cut Quality is Ideal, Price (USD) is 1810.5, volume is 0.8000
```

Format: `{xAxisLabel} is {categoryLabel}, {yAxisLabel} is {yValue}, volume is {densityValue}`

- `categoryLabel`: From `point.x` field
- `yValue`: Rounded to 4 decimal places
- `densityValue`: Shown as "volume", rounded to 4 decimal places. Only shown if density > 0.

**Terse mode:**
```
Ideal, 1810.5, 0.8000
```

### 10.2 Box Layer Text

**Verbose mode:**
```
Cut Quality is Ideal, 25% Price (USD) is 878
```

Format: `{mainAxisLabel} is {categoryLabel}, {sectionName} {crossAxisLabel} is {value}`

- `categoryLabel`: From `BoxPoint.fill`
- `sectionName`: One of: `"Lower outlier(s)"`, `"Minimum"`, `"25%"`, `"50%"`, `"Mean"`, `"75%"`, `"Maximum"`, `"Upper outlier(s)"`
- `value`: The numeric value for that section

**Terse mode:**
```
Ideal, 25% 878
```

### 10.3 Layer Switch Announcement

When switching layers:
```
Layer 1 of 2: violin box plot at Cut Quality is Ideal
Layer 2 of 2: violin kde plot at Cut Quality is Ideal
```

The cross value (Y) is excluded for violin box layers during layer switch announcements to avoid confusion.

---

## 11. Braille Output

### 11.1 KDE Layer Braille

Provides density values for braille rendering:
- `values`: 2D array of density values `number[][]`
- `min`/`max`: Per-violin minimum/maximum density (arrays)
- Row = current violin, Col = current curve position

### 11.2 Box Layer Braille

Provides BoxPoint array:
- `values`: Array of `BoxPoint` objects
- `min`/`max`: Global min/max across all box values
- Row/Col adjusted for orientation

---

## 12. Layer Switching

### 12.1 KDE -> Box (PageUp/PageDown)

1. Frontend reads current violin index (X value) from KDE layer.
2. Box layer receives the violin index via `moveToXValue()`.
3. Box layer sets position to that violin, resets to MIN section.
4. If the KDE layer also provides a Y value, box layer finds the closest section matching that Y value via `moveToXAndYValue()`.

### 12.2 Box -> KDE (PageUp/PageDown)

1. Frontend reads current violin index (X value) from box layer.
2. KDE layer receives the violin index via `onSwitchFrom()`.
3. KDE layer sets position to that violin.
4. If the box layer provides a Y value, KDE layer finds the closest Y position on the curve.
5. Falls back to bottom of curve (col=0) if Y matching fails.

**Key guarantee:** The violin group (categorical position) is always preserved during layer switching.

---

## 13. Orientation Support

| Orientation | Value | KDE: violins on | KDE: curve along | Box: violins on | Box: sections along |
|-------------|-------|-----------------|-------------------|-----------------|---------------------|
| Vertical | `"vert"` | X-axis (horizontal) | Y-axis (vertical) | X-axis | Y-axis |
| Horizontal | `"horz"` | Y-axis (vertical) | X-axis (horizontal) | Y-axis | X-axis |

**Default:** `"vert"` if not specified.

**Backend note for horizontal orientation:**
- The frontend reverses the point array for horizontal box plots to match visual order (lower-left start).
- Data should still be provided in natural order; the frontend handles the visual mapping.

---

## 14. Complete JSON Example

```json
{
  "id": "violin-plot-001",
  "title": "Diamond Price Distribution by Cut Quality",
  "subplots": [
    [
      {
        "layers": [
          {
            "id": "box-layer",
            "type": "violin_box",
            "axes": {
              "x": "Cut Quality",
              "y": "Price (USD)"
            },
            "violinOptions": {
              "showMedian": true,
              "showMean": false,
              "showExtrema": true
            },
            "selectors": [
              {
                "lowerOutliers": [],
                "min": "#box1 .whisker-min",
                "iq": "#box1 .iqr-rect",
                "q2": "#box1 .median-line",
                "max": "#box1 .whisker-max",
                "upperOutliers": ["#box1 .outlier-1", "#box1 .outlier-2"]
              },
              {
                "lowerOutliers": [],
                "min": "#box2 .whisker-min",
                "iq": "#box2 .iqr-rect",
                "q2": "#box2 .median-line",
                "max": "#box2 .whisker-max",
                "upperOutliers": []
              },
              {
                "lowerOutliers": [],
                "min": "#box3 .whisker-min",
                "iq": "#box3 .iqr-rect",
                "q2": "#box3 .median-line",
                "max": "#box3 .whisker-max",
                "upperOutliers": []
              }
            ],
            "data": [
              {
                "fill": "Ideal",
                "lowerOutliers": [],
                "min": 326,
                "q1": 878,
                "q2": 1810,
                "q3": 4678,
                "max": 18806,
                "upperOutliers": [18806]
              },
              {
                "fill": "Premium",
                "lowerOutliers": [],
                "min": 326,
                "q1": 1046,
                "q2": 3185,
                "q3": 6296,
                "max": 18823,
                "upperOutliers": []
              },
              {
                "fill": "Good",
                "lowerOutliers": [],
                "min": 327,
                "q1": 1145,
                "q2": 3050,
                "q3": 5028,
                "max": 18788,
                "upperOutliers": []
              }
            ]
          },
          {
            "id": "kde-layer",
            "type": "violin_kde",
            "title": "Diamond Price Distribution by Cut Quality",
            "axes": {
              "x": "Cut Quality",
              "y": "Price (USD)"
            },
            "selectors": [
              "#violin-group-1 path",
              "#violin-group-2 path",
              "#violin-group-3 path"
            ],
            "data": [
              [
                {"x": "Ideal",   "y": -501.7, "svg_x": 100.4, "svg_y": 281.8, "width": 0.044},
                {"x": "Ideal",   "y": -501.7, "svg_x": 103.8, "svg_y": 281.8, "width": 0.044},
                {"x": "Ideal",   "y": -294.2, "svg_x": 98.3,  "svg_y": 279.4, "width": 0.100},
                {"x": "Ideal",   "y": -294.2, "svg_x": 106.0, "svg_y": 279.4, "width": 0.100}
              ],
              [
                {"x": "Premium", "y": -400.0, "svg_x": 200.0, "svg_y": 270.0, "width": 0.035},
                {"x": "Premium", "y": -400.0, "svg_x": 205.0, "svg_y": 270.0, "width": 0.035}
              ],
              [
                {"x": "Good",    "y": -350.0, "svg_x": 300.0, "svg_y": 275.0, "width": 0.040},
                {"x": "Good",    "y": -350.0, "svg_x": 304.0, "svg_y": 275.0, "width": 0.040}
              ]
            ]
          }
        ]
      }
    ]
  ]
}
```

---

## 15. Field Reference Tables

### ViolinKdePoint

| Field | Type | Required | Default/Fallback | Description |
|-------|------|----------|-----------------|-------------|
| `x` | `string \| number` | YES | — | Categorical label for the violin group |
| `y` | `number` | YES | — | Numeric position along the density axis |
| `density` | `number` | NO | Falls back to `width` | KDE density estimation value |
| `width` | `number` | NO | Falls back to `0` | Half-width of violin (legacy format) |
| `svg_x` | `number` | NO | Highlight skipped | SVG viewport X coordinate |
| `svg_y` | `number` | NO | Highlight skipped | SVG viewport Y coordinate |

### BoxPoint

| Field | Type | Required | Default/Fallback | Description |
|-------|------|----------|-----------------|-------------|
| `fill` | `string` | YES | — | Category label (displayed in text) |
| `lowerOutliers` | `number[]` | YES | — | Lower outlier values (can be `[]`) |
| `min` | `number` | YES | — | Minimum (lower whisker) |
| `q1` | `number` | YES | — | 25th percentile |
| `q2` | `number` | YES | — | 50th percentile (median) |
| `q3` | `number` | YES | — | 75th percentile |
| `max` | `number` | YES | — | Maximum (upper whisker) |
| `upperOutliers` | `number[]` | YES | — | Upper outlier values (can be `[]`) |
| `mean` | `number` | NO | `NaN` (handled) | Mean value (only if `showMean: true`) |

### ViolinOptions

| Field | Type | Required | Default | Effect |
|-------|------|----------|---------|--------|
| `showMedian` | `boolean` | NO | `true` | Include Q2 (50%) in navigable sections |
| `showMean` | `boolean` | NO | `false` | Include Mean in navigable sections |
| `showExtrema` | `boolean` | NO | `true` | Include MIN and MAX in navigable sections |
| `showOutliers` | `boolean` | NO | `true` | Include outlier sections |

### BoxSelector

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `lowerOutliers` | `string[]` | YES | CSS selectors for lower outlier circles (can be `[]`) |
| `min` | `string` | YES | CSS selector for minimum whisker line |
| `iq` | `string` | YES | CSS selector for IQ box rectangle (Q1-Q3 range) |
| `q2` | `string` | YES | CSS selector for median line |
| `max` | `string` | YES | CSS selector for maximum whisker line |
| `upperOutliers` | `string[]` | YES | CSS selectors for upper outlier circles (can be `[]`) |
| `mean` | `string` | NO | CSS selector for mean marker (only if `showMean: true`) |

### TraceType Values

| Enum | String Value | Description |
|------|-------------|-------------|
| `VIOLIN_KDE` | `"violin_kde"` | KDE density curve layer |
| `VIOLIN_BOX` | `"violin_box"` | Box summary statistics layer |

### Orientation Values

| Enum | String Value | Description |
|------|-------------|-------------|
| `VERTICAL` | `"vert"` | Violins arranged horizontally, curves vertical (default) |
| `HORIZONTAL` | `"horz"` | Violins arranged vertically, curves horizontal |

---

## 16. Checklist for Backend Implementation

### Data Generation

- [ ] Set layer `type` to `"violin_box"` (NOT `"box"`)
- [ ] Set layer `type` to `"violin_kde"` (NOT `"smooth"`)
- [ ] **Put `violin_box` layer first** in the `layers` array (default view for users)
- [ ] KDE data is `ViolinKdePoint[][]` — outer array per violin, inner array per curve point
- [ ] KDE points include BOTH sides of violin (paired left/right at each Y level) — do NOT deduplicate
- [ ] KDE `x` field has the categorical label for every point in a violin
- [ ] KDE `y` field has numeric values, monotonically increasing along the curve
- [ ] KDE `density` or `width` field has the density value (at least one must be present)
- [ ] KDE `svg_x`/`svg_y` fields have SVG viewport coordinates for highlighting (recommended)
- [ ] Box data is `BoxPoint[]` — one per violin
- [ ] Box `fill` field matches the categorical label from KDE `x` field
- [ ] Box includes all standard fields: `lowerOutliers`, `min`, `q1`, `q2`, `q3`, `max`, `upperOutliers`
- [ ] Box `mean` field included only when `violinOptions.showMean` is `true`
- [ ] Outlier arrays can be empty `[]` but MUST be present

### Configuration

- [ ] Both layers in the same subplot `layers` array
- [ ] `violinOptions` set on the `violin_box` layer (not the `violin_kde` layer)
- [ ] `orientation` consistent between both layers (both `"vert"` or both `"horz"`)
- [ ] `axes` labels consistent between both layers

### SVG Selectors

- [ ] KDE selectors: one CSS selector per violin OR one single pattern
- [ ] Box selectors: `BoxSelector[]` with one entry per violin
- [ ] Box `iq` selector points to the IQ box `<rect>` element (used to derive Q1/Q3 highlight)
- [ ] Box `mean` selector provided only when `showMean: true`
- [ ] Outlier selector arrays can be empty but must be present

### Validation

- [ ] Number of KDE sub-arrays === number of BoxPoints === number of BoxSelectors
- [ ] All violins have the same number of curve points (recommended for consistent navigation)
- [ ] All BoxPoint numeric fields are valid numbers (not `null` or `undefined`)
- [ ] SVG selectors resolve to actual elements in the rendered SVG DOM
