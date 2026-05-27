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

## Supported Chart Types

| Victory Component | MAIDR type | Highlight | Notes |
|---|---|---|---|
| `VictoryBar` | Bar chart | ✅ | |
| `VictoryLine` | Line chart | ✅ | |
| `VictoryScatter` | Scatter plot | ✅ | |
| `VictoryStack` | Stacked bar chart | ✅ | Each child `<VictoryBar name="...">` becomes one series. |
| `VictoryHistogram` | Histogram | ⚠️ | The adapter derives equal-width bins from the raw values, which may not exactly match Victory's rendered bins. |
| `VictoryBoxPlot` | Box plot | ✅ | Per-section highlight (min, Q1, median, Q3, max). Requires pre-computed statistics. |
| `VictoryCandlestick` | Candlestick chart | ✅ | Per-section highlight (open, high, low, close, volatility). |

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
  extractVictoryLayers, // Lower-level: children → layer info
  toMaidrLayer, // Lower-level: layer info → MAIDR layer
  type MaidrVictoryProps, // Props for MaidrVictory
  type VictoryAdapterConfig, // Config accepted by the hook
  type VictoryComponentType, // Supported Victory component names
  type VictoryLayerData, // Extracted layer data union
  type VictoryLayerInfo, // Intermediate layer representation
} from 'maidr/victory';
```

### `VictoryComponentType`

```typescript
type VictoryComponentType =
  | 'VictoryBar'
  | 'VictoryLine'
  | 'VictoryScatter'
  | 'VictoryBoxPlot'
  | 'VictoryCandlestick'
  | 'VictoryHistogram'
  | 'VictoryStack';
```

## Advanced

### How It Works

`<MaidrVictory>` is a convenience wrapper that:

1. Introspects the Victory components passed as `children` to extract their data and axis labels (`extractVictoryLayers`).
2. Tags the rendered Victory SVG elements with `data-maidr-victory-*` attributes so MAIDR can highlight them by CSS selector.
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

For a complete list, see the [Controls documentation](index.html#controls).
