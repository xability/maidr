# Victory Integration

MAIDR provides a dedicated adapter for [Victory](https://commerce.nearform.com/open-source/victory/) that automatically makes Victory charts accessible. Wrap your Victory chart with `<MaidrVictory>` — the adapter introspects the Victory components you pass as children, extracts their data, and tags the rendered SVG for highlighting. There is no need to manually build MAIDR's JSON data structure.

## Installation

```bash
npm install maidr@latest victory
```

MAIDR requires React 18 or 19 as a peer dependency:

```bash
npm install react react-dom
```

## Quick Start

Import `MaidrVictory` from `maidr/victory` and wrap your Victory chart:

```tsx
import { MaidrVictory } from 'maidr/victory';
import { VictoryAxis, VictoryBar, VictoryChart } from 'victory';

function AccessibleBarChart() {
  return (
    <MaidrVictory id="sales-chart" title="Quarterly Revenue">
      <VictoryChart domainPadding={24}>
        <VictoryAxis label="Quarter" />
        <VictoryAxis dependentAxis label="Revenue ($)" />
        <VictoryBar
          data={[
            { x: 'Q1', y: 4200 },
            { x: 'Q2', y: 5800 },
            { x: 'Q3', y: 3900 },
            { x: 'Q4', y: 7100 },
          ]}
        />
      </VictoryChart>
    </MaidrVictory>
  );
}
```

Unlike config-driven adapters, you do not pass `data`/`chartType` props to `<MaidrVictory>` — the data is read directly from the Victory components you nest inside it. Axis labels are read from `<VictoryAxis label="...">` (use `dependentAxis` for the y-axis).

## Props Reference

### `<MaidrVictory>`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the chart (used for DOM IDs). |
| `children` | `ReactNode` | Yes | Victory chart component(s) to make accessible. |
| `title` | `string` | No | Chart title displayed in text descriptions. |
| `subtitle` | `string` | No | Chart subtitle. |
| `caption` | `string` | No | Chart caption. |
| `layout` | `{ rows?: number; columns?: number }` | No | Row-major grid for [multi-panel figures](#multi-panel-figures). Only consulted with two or more `<VictoryChart>` children. |
| `percentileBands` | `{ median: string; bands: { series: string; lower: number; upper: number }[]; title?: string; name?: string }[]` | No | Fan charts: a `<VictoryLine>` median and `<VictoryArea>` bands drawn with `y0`, each named by its `name` prop. See [Fan Chart](#fan-chart-experimental). |

## Supported Chart Types

| Victory Component | MAIDR type | Highlight | Notes |
|---|---|---|---|
| `VictoryBar` | Bar chart | ✅ | |
| `VictoryLine` | Line chart | ✅ | |
| `VictoryLine` | Step chart | ✅ | With `interpolation="step"`, `"stepBefore"` or `"stepAfter"`. |
| `VictoryScatter` | Scatter plot | ✅ | |
| `VictoryStack` | Stacked bar chart | ✅ | Each child `<VictoryBar name="...">` becomes one series. |
| `VictoryGroup` | Dodged bar chart | ✅ | A group of `<VictoryBar>` children. Wrapping anything else, the group is read through: each child becomes the layer it would be on its own. |
| `VictoryHistogram` | Histogram | ⚠️ | The adapter derives equal-width bins from the raw values, which may not exactly match Victory's rendered bins. |
| `VictoryBoxPlot` | Box plot | ✅ | Per-section highlight (min, Q1, median, Q3, max). Requires pre-computed statistics. |
| `VictoryCandlestick` | Candlestick chart | ✅ | Per-section highlight (open, high, low, close, volatility). |
| `VictoryPie` | Pie chart | ✅ | A doughnut is the same component with an `innerRadius`. Standing alone it has no `VictoryAxis` to read labels from, so the axes are named `Category` and `Value`; wrap it in a `<VictoryChart>` with axis labels to override. |
| `VictoryLine` + `VictoryArea` with `y0` | Percentile band (fan chart) [experimental] | ✅ | Only when named in `percentileBands`; see [Fan Chart](#fan-chart-experimental). |
| `VictoryLine` | Precision-recall curve [experimental] | ✅ | Read off the axes: the x `VictoryAxis` labelled exactly `Recall`, the dependent axis `Precision` (case aside), and every point from 0 to 1. Anything else, rates in percent included, stays a line. |

> Box and candlestick are composite shapes (rects + lines) with no semantic classes, so the adapter classifies their parts by geometry. If a future Victory version changes that layout, highlighting degrades gracefully — audio, text, and braille are unaffected.

## Data Examples by Chart Type

### Bar Chart

```tsx
<MaidrVictory id="bar-example" title="Quarterly Revenue">
  <VictoryChart domainPadding={24}>
    <VictoryAxis label="Quarter" />
    <VictoryAxis dependentAxis label="Revenue ($)" />
    <VictoryBar
      data={[
        { x: 'Q1', y: 4200 },
        { x: 'Q2', y: 5800 },
        { x: 'Q3', y: 3900 },
        { x: 'Q4', y: 7100 },
      ]}
    />
  </VictoryChart>
</MaidrVictory>
```

### Line Chart

```tsx
<MaidrVictory id="line-example" title="Monthly Active Users">
  <VictoryChart domainPadding={24}>
    <VictoryAxis label="Month" />
    <VictoryAxis dependentAxis label="Users" />
    <VictoryLine
      data={[
        { x: 'Jan', y: 120 },
        { x: 'Feb', y: 180 },
        { x: 'Mar', y: 150 },
        { x: 'Apr', y: 220 },
      ]}
    />
  </VictoryChart>
</MaidrVictory>
```

### Scatter Chart

```tsx
<MaidrVictory id="scatter-example" title="Measurements">
  <VictoryChart domainPadding={24}>
    <VictoryAxis label="Sample" />
    <VictoryAxis dependentAxis label="Value" />
    <VictoryScatter
      size={5}
      data={[
        { x: 1, y: 2.3 },
        { x: 2, y: 3.1 },
        { x: 3, y: 2.8 },
        { x: 4, y: 4.5 },
      ]}
    />
  </VictoryChart>
</MaidrVictory>
```

### Stacked Bar Chart

Wrap multiple `<VictoryBar>` series in `<VictoryStack>`. Each child's `name` prop becomes the series label.

```tsx
<MaidrVictory id="stacked-example" title="Revenue by Product">
  <VictoryChart domainPadding={24}>
    <VictoryAxis label="Quarter" />
    <VictoryAxis dependentAxis label="Revenue ($)" />
    <VictoryStack>
      <VictoryBar
        name="Product A"
        data={[{ x: 'Q1', y: 2400 }, { x: 'Q2', y: 3100 }]}
      />
      <VictoryBar
        name="Product B"
        data={[{ x: 'Q1', y: 1800 }, { x: 'Q2', y: 2700 }]}
      />
    </VictoryStack>
  </VictoryChart>
</MaidrVictory>
```

### Dodged (Grouped) Bar Chart

Wrap multiple `<VictoryBar>` series in `<VictoryGroup>`. Each child's `name`
prop becomes the series label, exactly as in a stack — what differs is that the
bars sit side by side rather than on one another, so the values are announced as
written instead of accumulating.

```tsx
<MaidrVictory id="dodged-example" title="Revenue by Product">
  <VictoryChart domainPadding={24}>
    <VictoryAxis label="Quarter" />
    <VictoryAxis dependentAxis label="Revenue ($)" />
    <VictoryGroup offset={20}>
      <VictoryBar
        name="Product A"
        data={[{ x: 'Q1', y: 2400 }, { x: 'Q2', y: 3100 }]}
      />
      <VictoryBar
        name="Product B"
        data={[{ x: 'Q1', y: 1800 }, { x: 'Q2', y: 2700 }]}
      />
    </VictoryGroup>
  </VictoryChart>
</MaidrVictory>
```

A `<VictoryGroup>` around anything but bars is Victory offsetting and colouring
its children without changing what they mean, so each is read as the layer it
would be on its own — a group of `<VictoryLine>` children is the multi-series
line it draws. The same applies to a polar group, whose bars draw a coxcomb:
each becomes its own polar area rather than a band of one dodged layer.

### Histogram

Pass raw observations; the adapter derives equal-width bins. Use the `bins` prop to control the bin count.

```tsx
<MaidrVictory id="histogram-example" title="Value Distribution">
  <VictoryChart domainPadding={12}>
    <VictoryAxis label="Value" />
    <VictoryAxis dependentAxis label="Frequency" />
    <VictoryHistogram
      bins={5}
      data={[{ x: 1 }, { x: 2 }, { x: 2 }, { x: 3 }, { x: 5 }, { x: 8 }]}
    />
  </VictoryChart>
</MaidrVictory>
```

> **Note:** Victory computes histogram bins internally during render, while the adapter derives bins from the raw values independently. The described bins may not perfectly match the drawn bars.

### Box Plot

Provide pre-computed quartile statistics. The adapter reads these directly and does not derive quartiles from raw arrays.

```tsx
<MaidrVictory id="box-example" title="Distribution by Group">
  <VictoryChart domainPadding={24}>
    <VictoryAxis label="Group" />
    <VictoryAxis dependentAxis label="Value" />
    <VictoryBoxPlot
      boxWidth={20}
      data={[
        { x: 'A', min: 2, q1: 5, median: 8, q3: 12, max: 16 },
        { x: 'B', min: 4, q1: 7, median: 10, q3: 14, max: 20 },
      ]}
    />
  </VictoryChart>
</MaidrVictory>
```

`<VictoryBoxPlot horizontal>` — or any box plot inside a `<VictoryChart horizontal>` — is announced as a horizontal box plot and read against the axes as drawn: the group off the y axis, the measurement off the x. The same is true of `<VictoryErrorBar>`. Neither payload changes with it; only the bar family exchanges its `x` and `y`.

### Candlestick

```tsx
<MaidrVictory id="candlestick-example" title="Weekly Price">
  <VictoryChart domainPadding={24}>
    <VictoryAxis label="Day" />
    <VictoryAxis dependentAxis label="Price ($)" />
    <VictoryCandlestick
      data={[
        { x: 'Mon', open: 100, close: 110, high: 115, low: 98 },
        { x: 'Tue', open: 110, close: 105, high: 112, low: 102 },
      ]}
    />
  </VictoryChart>
</MaidrVictory>
```

### Pie Chart

`VictoryPie` follows Victory's usual `x`/`y` convention: `x` names the slice, `y` is its magnitude. It stands on its own — no `VictoryChart`, no `VictoryAxis`:

```tsx
<MaidrVictory id="pie-example" title="Units Sold by Fruit">
  <VictoryPie
    data={[
      { x: 'Apples', y: 30 },
      { x: 'Bananas', y: 50 },
      { x: 'Cherries', y: 20 },
    ]}
  />
</MaidrVictory>
```

Left and Right move between slices; Up and Down are out of bounds, since a pie is a single row. Each slice announces its label, its value, and its share of the whole — "Category is Apples, Value is 30, Percentage is 30.0%". Victory renders the wedges in data order, so highlighting is index-aligned with no extra configuration, and an `innerRadius` makes it a doughnut without changing any of that.

### Fan Chart [experimental]

A `<VictoryArea>` given `y0` fills between two values -- a fan chart's band -- and nothing on it says which quantiles those are: the same area draws a min-max envelope and a 90% interval. Name each component with its own `name` prop and say what the bands are:

```tsx
<MaidrVictory
  id="forecast"
  title="Forecast"
  percentileBands={[{
    median: 'median',
    bands: [
      { series: 'p90', lower: 0.05, upper: 0.95 },
      { series: 'p50', lower: 0.25, upper: 0.75 },
    ],
  }]}
>
  <VictoryChart>
    <VictoryArea name="p90" data={rows} x="step" y0="p5" y="p95" style={{ data: { fillOpacity: 0.2 } }} />
    <VictoryArea name="p50" data={rows} x="step" y0="p25" y="p75" style={{ data: { fillOpacity: 0.4 } }} />
    <VictoryLine name="median" data={rows} x="step" y="p50" />
  </VictoryChart>
</MaidrVictory>
```

`median` names a `<VictoryLine>` and each band's `series` a `<VictoryArea>` drawn with `y0` (as an accessor prop or on each datum). They become one percentile band layer: the median's values, and each band's `y0` and `y` as its two edges, matched to the median by x. The levels are fractions (`0.05`, not `5`), every `lower` below 0.5 and every `upper` above it, and the bands must nest; the same validator as the co-located `maidr` declaration other adapters read refuses an entry that fails, with a console warning. A band naming no `<VictoryArea>`, or one drawn down to the baseline without `y0`, is reported and left out, and stays an area layer of its own; a median naming no `<VictoryLine>` leaves the chart read as before.

Each band is outlined as the path its `<VictoryArea>` draws, outermost first, and the median as its line -- verified against the markup Victory 37.3.6 renders, where the five levels of a two-band fan outlined the outer band, the inner band, the median, the inner band and the outer band.

## Multi-Panel Figures

Nest two or more `<VictoryChart>` components inside one `<MaidrVictory>` to build a multi-panel (small-multiples) figure. Each chart becomes one MAIDR subplot: arrow keys move between panels, `Enter` drills into the focused panel, and `Escape` returns to panel navigation. Give each chart a `title` prop — it becomes the panel's name in subplot announcements.

```tsx
<MaidrVictory
  id="regional-sales"
  title="Quarterly Sales by Region"
  layout={{ columns: 2 }}
>
  <VictoryChart title="North Region" domainPadding={24}>
    <VictoryAxis label="Quarter" />
    <VictoryAxis dependentAxis label="Revenue ($)" />
    <VictoryBar data={northData} />
  </VictoryChart>
  <VictoryChart title="South Region" domainPadding={24}>
    <VictoryAxis label="Quarter" />
    <VictoryAxis dependentAxis label="Revenue ($)" />
    <VictoryBar data={southData} />
  </VictoryChart>
  <VictoryChart title="East Region" domainPadding={24}>
    <VictoryAxis label="Quarter" />
    <VictoryAxis dependentAxis label="Revenue ($)" />
    <VictoryBar data={eastData} />
  </VictoryChart>
  <VictoryChart title="West Region" domainPadding={24}>
    <VictoryAxis label="Quarter" />
    <VictoryAxis dependentAxis label="Revenue ($)" />
    <VictoryBar data={westData} />
  </VictoryChart>
</MaidrVictory>
```

By default the panels form a single navigable row in children order. The `layout` prop chunks them row-major into a grid: `columns` fixes the panels per row (the last row may be shorter), or `rows` derives the column count when `columns` is omitted. Match `layout` to how you visually arrange the charts with CSS.

Each panel keeps its own axis labels (from its own `<VictoryAxis>` children), its own layers (a chart with several data components stays a multi-layer panel, switchable with `Page Up`/`Page Down` after drilling in), and its own highlight scope — one panel's highlighting can never bleed into another.

Notes and limitations:

- Charts must be **direct children** of `<MaidrVictory>`; charts wrapped in your own components are not detected. Lay panels out visually with CSS on the surrounding page.
- Charts rendered with `standalone={false}` into a shared parent SVG are not supported for multi-panel detection.
- In multi-panel mode, standalone data components (e.g. a bare `<VictoryScatter>`) outside any `<VictoryChart>` are ignored with a console warning. With at most one `<VictoryChart>`, everything is flattened into a single panel exactly as before.
- A `<VictoryChart>` that contains no supported data components is omitted from subplot navigation (with a console warning). The remaining panels keep the grid cells of your `layout` — only the dropped chart's cell disappears from its row.
- For multi-row grids (`rows` ≥ 2), MAIDR measures each panel's rendered position, so the Up/Down arrows follow the visual arrangement of your CSS layout. If panel positions cannot be measured (for example, panels that overlap at the same position), navigation conservatively falls back to children order, where Up/Down may not match the visual arrangement. Single-row layouts are unaffected.

## Using the Hook

For full control over rendering, use the `useVictoryAdapter` hook with the low-level `<Maidr>` component. Provide a container ref so the adapter can tag the rendered SVG elements.

```tsx
import { useRef } from 'react';
import { Maidr } from 'maidr/react';
import { useVictoryAdapter } from 'maidr/victory';
import { VictoryChart, VictoryLine } from 'victory';

function AccessibleLineChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const children = (
    <VictoryChart>
      <VictoryLine data={[{ x: 1, y: 10 }, { x: 2, y: 20 }]} />
    </VictoryChart>
  );
  const maidrData = useVictoryAdapter(
    { id: 'trend', title: 'Trend', children },
    containerRef,
  );

  return (
    <Maidr data={maidrData}>
      <div ref={containerRef}>{children}</div>
    </Maidr>
  );
}
```

## TypeScript Types

All types are exported from `maidr/victory`:

```tsx
import {
  MaidrVictory, // The wrapper component
  useVictoryAdapter, // The conversion hook
  extractVictoryLayers, // Lower-level: children → flat layer info
  extractVictorySubplots, // Lower-level: children → per-panel subplot info
  computeSubplotGrid, // Lower-level: panels + layout → row-major grid
  toMaidrLayer, // Lower-level: layer info → MAIDR layer
  type MaidrVictoryProps, // Props for MaidrVictory
  type VictoryAdapterConfig, // Config accepted by the hook
  type VictoryComponentType, // Supported Victory component names
  type VictoryLayerData, // Extracted layer data union
  type VictoryLayerInfo, // Intermediate layer representation
  type VictoryPanelLayout, // Multi-panel grid layout ({ rows?, columns? })
  type VictorySubplotInfo, // Intermediate panel representation
} from 'maidr/victory';
```

### `VictoryComponentType`

```typescript
type VictoryComponentType =
  | 'VictoryArea'
  | 'VictoryBar'
  | 'VictoryLine'
  | 'VictoryScatter'
  | 'VictoryBoxPlot'
  | 'VictoryCandlestick'
  | 'VictoryErrorBar'
  | 'VictoryHistogram'
  | 'VictoryPie'
  | 'VictoryStack'
  | 'VictoryGroup';
```

## Advanced

### How It Works

`<MaidrVictory>` is a convenience wrapper that:

1. Introspects the Victory components passed as `children` to extract their data and axis labels, grouping top-level `<VictoryChart>` components into panels (`extractVictorySubplots`).
2. Tags the rendered Victory SVG elements with `data-maidr-victory-*` attributes so MAIDR can highlight them by CSS selector. In multi-panel mode, each panel's `<svg>` is stamped with `data-maidr-victory-panel="<i>"` and all selectors are scoped to it, so panels never cross-highlight.
3. Converts each layer into MAIDR's internal format (`toMaidrLayer`) and renders the children inside the `<Maidr>` component.

Selector tagging relies on Victory's `role="presentation"` attribute on data elements (a stable Victory convention, tested with v37). If that convention changes, highlighting degrades gracefully — audio, text, and braille are unaffected.

### Victory vs React (Low-Level)

| Feature | Victory Adapter | React (Low-Level) |
|---------|-----------------|-------------------|
| Import | `import { MaidrVictory } from 'maidr/victory'` | `import { Maidr } from 'maidr/react'` |
| Data format | Read from Victory component props | MAIDR typed structures |
| Configuration | Compose Victory children | Manual `MaidrData` JSON |
| Chart types | 7 Victory components | All MAIDR trace types |
| SVG highlighting | Automatic (except box/candlestick) | Manual `selectors` setup |
| Best for | Victory projects | Custom SVG / other libraries |

## Keyboard Controls

Once a chart is focused, the following keyboard shortcuts are available:

| Function | Key (Windows) | Key (Mac) |
|----------|--------------|-----------|
| Move around plot | Arrow keys | Arrow keys |
| Go to extremes | Ctrl + Arrow | Cmd + Arrow |
| Toggle Braille Mode | B | B |
| Toggle Sonification | S | S |
| Toggle Text Mode | T | T |
| Toggle Review Mode | R | R |
| Auto-play | Ctrl + Shift + Arrow | Cmd + Shift + Arrow |
| Stop Auto-play | Ctrl | Cmd |
| Open Settings | Ctrl + , | Cmd + , |
| Open Command Palette | Ctrl + Shift + P | Cmd + Shift + P |

For a complete list, see the [Controls documentation](../README.md#controls).
