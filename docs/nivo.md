# Nivo Integration

MAIDR provides a dedicated adapter for [Nivo](https://nivo.rocks/) that makes Nivo's React charts accessible. Wrap a Nivo chart in `<MaidrNivo>` and say which kind of chart it is. The adapter reads the chart's own props (`data`, `keys`, `indexBy`, `layout`, the axis legends, and so on), converts them into MAIDR's data structure, and points highlighting at the SVG Nivo renders. You do not build MAIDR's JSON yourself.

## Installation

```bash
npm install maidr@latest @nivo/core @nivo/bar
```

Install the `@nivo/*` package for each chart kind you use: `@nivo/bar`, `@nivo/line`, `@nivo/scatterplot`, `@nivo/pie`, `@nivo/heatmap` or `@nivo/boxplot`. The adapter is tested against Nivo 0.99. It never imports a `@nivo/*` package itself, so none of them is a dependency of `maidr`.

MAIDR requires React 18 or 19 as a peer dependency:

```bash
npm install react react-dom
```

## Quick Start

Import `MaidrNivo` from `maidr/nivo`, wrap your chart, and set `type`:

```tsx
import { ResponsiveBar } from '@nivo/bar';
import { MaidrNivo } from 'maidr/nivo';

function AccessibleBarChart() {
  return (
    <MaidrNivo id="sales-chart" title="Quarterly Revenue" type="bar">
      <div style={{ width: 600, height: 400 }}>
        <ResponsiveBar
          data={[
            { quarter: 'Q1', revenue: 4200 },
            { quarter: 'Q2', revenue: 5800 },
            { quarter: 'Q3', revenue: 3900 },
            { quarter: 'Q4', revenue: 7100 },
          ]}
          keys={['revenue']}
          indexBy="quarter"
          axisBottom={{ legend: 'Quarter' }}
          axisLeft={{ legend: 'Revenue ($)' }}
        />
      </div>
    </MaidrNivo>
  );
}
```

**The `type` prop is required.** Nivo exports its charts as `memo`/`forwardRef` components with no display name, so the adapter cannot tell a `<Bar>` from a `<Line>` by looking at the element. `type` tells it which props to expect.

**Give a `Responsive*` chart a sized parent.** A `ResponsiveBar`, `ResponsiveLine` and so on fill their parent element. MAIDR's own wrapper sizes itself to its content, so without a sized `<div>` inside `<MaidrNivo>` the chart measures zero width and draws nothing. A fixed-size chart (`<Bar width={600} height={400} ... />`) needs no wrapper.

Axis labels come from Nivo's axis `legend` fields: `axisBottom.legend` (or `axisTop.legend`) for the axis across the page, and `axisLeft.legend` (or `axisRight.legend`) for the axis up the page.

## Props Reference

### `<MaidrNivo>`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the chart (used for DOM IDs). |
| `type` | `NivoChartType` | Yes | Which Nivo chart the child is: `'bar'`, `'line'`, `'scatterplot'`, `'pie'`, `'heatmap'` or `'boxplot'`. |
| `children` | `ReactNode` | Yes | One Nivo chart element. Fragments and plain HTML wrappers such as a sized `<div>` are looked through to find it. |
| `title` | `string` | No | Chart title displayed in text descriptions. |
| `subtitle` | `string` | No | Chart subtitle. |
| `caption` | `string` | No | Chart caption. |

`<MaidrNivo>` reads the props of the first component element among its children. Put one chart in each `<MaidrNivo>`. If it finds no chart, it logs a console warning.

## Supported Chart Types

| MAIDR type | `type` | Nivo component | Highlight | Notes |
|---|---|---|---|---|
| Bar chart | `'bar'` | `Bar` / `ResponsiveBar` | ✅ | One visible key. `layout="horizontal"` is supported. |
| Stacked bar chart | `'bar'` | `Bar` / `ResponsiveBar` | ✅ | Two or more keys with the default `groupMode` (`'stacked'`). |
| Dodged (grouped) bar chart | `'bar'` | `Bar` / `ResponsiveBar` | ✅ | Two or more keys with `groupMode="grouped"`. With `layout="horizontal"`, the series are read from the bottom of each band up. |
| Line chart | `'line'` | `Line` / `ResponsiveLine` | ✅ | One layer with one row per series; Up and Down move between them. |
| Step chart | `'line'` | `Line` / `ResponsiveLine` | ✅ | With `curve="step"`, `"stepAfter"` or `"stepBefore"`. |
| Scatter plot | `'scatterplot'` | `ScatterPlot` / `ResponsiveScatterPlot` | ✅ | One layer per series. |
| Pie / doughnut chart | `'pie'` | `Pie` / `ResponsivePie` | ✅ | A doughnut is the same chart with an `innerRadius`. No highlight with `sortByValue`. |
| Heatmap | `'heatmap'` | `HeatMap` / `ResponsiveHeatMap` | ✅ | |
| Box plot | `'boxplot'` | `BoxPlot` / `ResponsiveBoxPlot` | ✅ | Whiskers end at the 10th and 90th percentiles by default. See [Box plot](#box-plot). |

Only the SVG components are supported. The `*Canvas` variants (`BarCanvas`, `LineCanvas`, `ScatterPlotCanvas`, `PieCanvas`, `HeatMapCanvas` and their `Responsive*` forms) are not. Their props are still read, so audio, text and braille work, but a canvas has no elements to highlight. The adapter logs one console warning and emits no selectors.

Series or keys hidden with `initialHiddenIds` are left out, as Nivo leaves them out of the drawing.

## Data Examples by Chart Type

### Bar Chart

One key gives a plain bar chart. `indexBy` names the category field and defaults to `'id'`, as in Nivo.

```tsx
<MaidrNivo id="bar-example" title="Quarterly Revenue" type="bar">
  <Bar
    width={600}
    height={400}
    data={[
      { quarter: 'Q1', revenue: 4200 },
      { quarter: 'Q2', revenue: 5800 },
      { quarter: 'Q3', revenue: 3900 },
    ]}
    keys={['revenue']}
    indexBy="quarter"
    axisBottom={{ legend: 'Quarter' }}
    axisLeft={{ legend: 'Revenue ($)' }}
  />
</MaidrNivo>
```

With `layout="horizontal"` the bars run across the page and MAIDR reads the chart as a horizontal bar chart. The value axis is then the bottom axis, so put the value label on `axisBottom` and the category label on `axisLeft`. Nivo draws the first category at the bottom of a horizontal chart, and MAIDR reads it in that order.

A bar whose value is `null` or missing is not drawn by Nivo. In a single-key chart it is left out. In a stacked or grouped chart it stays as a gap, so the other series keep their positions.

### Stacked Bar Chart

Several keys stack by default, because Nivo's `groupMode` defaults to `'stacked'`. Each key becomes one series and is named in the legend.

```tsx
<MaidrNivo id="stacked-example" title="Revenue by Product" type="bar">
  <Bar
    width={600}
    height={400}
    data={[
      { quarter: 'Q1', productA: 2400, productB: 1800 },
      { quarter: 'Q2', productA: 3100, productB: 2700 },
    ]}
    keys={['productA', 'productB']}
    indexBy="quarter"
    axisBottom={{ legend: 'Quarter' }}
    axisLeft={{ legend: 'Revenue ($)' }}
  />
</MaidrNivo>
```

### Dodged (Grouped) Bar Chart

Set `groupMode="grouped"` to draw the keys side by side. The data and keys are the same as for a stacked chart. The difference is that each value is announced as written, instead of adding up.

```tsx
<MaidrNivo id="dodged-example" title="Revenue by Product" type="bar">
  <Bar
    width={600}
    height={400}
    groupMode="grouped"
    data={[
      { quarter: 'Q1', productA: 2400, productB: 1800 },
      { quarter: 'Q2', productA: 3100, productB: 2700 },
    ]}
    keys={['productA', 'productB']}
    indexBy="quarter"
    axisBottom={{ legend: 'Quarter' }}
    axisLeft={{ legend: 'Revenue ($)' }}
  />
</MaidrNivo>
```

### Line Chart

Each entry of `data` is one series (`{ id, data: [{ x, y }] }`). All the series go into one layer. Use the arrow keys to move along a series and between series.

```tsx
<MaidrNivo id="line-example" title="Monthly Active Users" type="line">
  <Line
    width={600}
    height={400}
    data={[
      {
        id: 'web',
        data: [{ x: 'Jan', y: 120 }, { x: 'Feb', y: 180 }, { x: 'Mar', y: 150 }],
      },
      {
        id: 'mobile',
        data: [{ x: 'Jan', y: 90 }, { x: 'Feb', y: 130 }, { x: 'Mar', y: 170 }],
      },
    ]}
    axisBottom={{ legend: 'Month' }}
    axisLeft={{ legend: 'Users' }}
  />
</MaidrNivo>
```

A point whose `x` or `y` is `null` is skipped. Nivo draws a gap there and no point marker, and MAIDR moves straight to the next point.

### Step Chart

A line chart with a step `curve` is read as a step chart: `curve="step"` (step in the middle), `"stepAfter"` or `"stepBefore"`.

```tsx
<MaidrNivo id="step-example" title="Price Tier by Month" type="line">
  <Line
    width={600}
    height={400}
    curve="stepAfter"
    data={[{ id: 'tier', data: [{ x: 1, y: 10 }, { x: 2, y: 10 }, { x: 3, y: 15 }] }]}
    axisBottom={{ legend: 'Month' }}
    axisLeft={{ legend: 'Price ($)' }}
  />
</MaidrNivo>
```

### Scatter Plot

Each series becomes its own layer, named after its `id`. Use Page Up and Page Down to switch between series. A datum whose `x` or `y` is not a number, a numeric string or a date is left out, and the console says so when a whole series is.

On a time scale (`xScale={{ type: 'time', format: '%Y-%m-%d' }}`, or the same on `yScale`), string dates are parsed with the scale's `format`, in UTC unless `useUTC` is `false`, as Nivo parses them. The common d3-time-format directives are understood (`%Y %y %m %d %e %H %I %M %S %L %f %p %b %B %a %A %Q %s`). The axis then announces its values as dates.

A legend drawn with `symbolShape: 'circle'` does not get in the way of the highlight: only the circles of the nodes layer are counted. A custom `nodeComponent`, or annotations drawn as circles, still change the count; the adapter then says so in the console and leaves the scatter plot without a highlight rather than outline the wrong node.

```tsx
<MaidrNivo id="scatter-example" title="Height and Weight" type="scatterplot">
  <ScatterPlot
    width={600}
    height={400}
    data={[
      { id: 'group A', data: [{ x: 160, y: 55 }, { x: 172, y: 68 }] },
      { id: 'group B', data: [{ x: 165, y: 60 }, { x: 180, y: 80 }] },
    ]}
    axisBottom={{ legend: 'Height (cm)' }}
    axisLeft={{ legend: 'Weight (kg)' }}
  />
</MaidrNivo>
```

### Pie / Doughnut Chart

Each datum is one slice. The slice is named by its `label`, or by its `id` if it has no label. A pie has no axes, so the values are announced as `Category` and `Value`.

```tsx
<MaidrNivo id="pie-example" title="Units Sold by Fruit" type="pie">
  <Pie
    width={400}
    height={400}
    innerRadius={0.5}
    data={[
      { id: 'apples', label: 'Apples', value: 30 },
      { id: 'bananas', label: 'Bananas', value: 50 },
      { id: 'cherries', label: 'Cherries', value: 20 },
    ]}
  />
</MaidrNivo>
```

Left and Right move between slices. Each slice announces its label, its value and its share of the whole. `startAngle` and `endAngle` are honoured. Nivo starts at 12 o'clock and runs clockwise by default, and MAIDR describes the slices in the same order. An `innerRadius` makes the pie a doughnut and changes nothing else.

With `sortByValue`, Nivo arranges the slices largest first, but it still writes them into the SVG in data order. MAIDR reads the slices in the order they appear around the pie. It turns the highlight off for such a chart, because it cannot reliably match each slice to its SVG element.

### Heatmap

Each row is `{ id, data: [{ x, y }] }`, where `y` is the cell value. The columns are the `x` values of all the rows, in the order they first appear, which is how Nivo lays them out. The rows are the row ids, from top to bottom.

```tsx
<MaidrNivo id="heatmap-example" title="Sales by Region and Quarter" type="heatmap">
  <HeatMap
    width={600}
    height={400}
    data={[
      { id: 'North', data: [{ x: 'Q1', y: 12 }, { x: 'Q2', y: 18 }] },
      { id: 'South', data: [{ x: 'Q1', y: 9 }, { x: 'Q2', y: null }] },
    ]}
    axisTop={{ legend: 'Quarter' }}
    axisLeft={{ legend: 'Region' }}
  />
</MaidrNivo>
```

A `null` value is read as an empty cell. Nivo still draws that cell in its `emptyColor`, so it is still highlighted. Nivo shows the column axis at the top by default, so the column label is taken from `axisTop.legend`, falling back to `axisBottom.legend`.

### Box Plot

`@nivo/boxplot` takes raw observations (`{ group, subGroup?, value }`) and computes each box itself. MAIDR repeats that computation the way Nivo does it, with the same grouping, sorting and interpolation, so the numbers you hear are the numbers drawn.

**Nivo's whiskers are not Tukey's.** Its default `quantiles` are `[0.1, 0.25, 0.5, 0.75, 0.9]`. The box spans the 25th to 75th percentile and the whiskers end at the **10th and 90th percentiles**, not at 1.5 × IQR. MAIDR announces those whisker ends as the percentiles they are, "10th percentile" and "90th percentile", rather than as a minimum and maximum. It does so through the layer's `whiskerQuantiles` field, which the adapter omits when the quantiles run from 0 to 1 and the whiskers do end at the extremes. A custom `quantiles` prop is honoured. It must have five values, otherwise the adapter warns and emits nothing. Nivo draws no points beyond the whiskers, so MAIDR reports no outliers.

```tsx
<MaidrNivo id="box-example" title="Scores by Class" type="boxplot">
  <BoxPlot
    width={600}
    height={400}
    data={[
      { group: 'A', value: 62 },
      { group: 'A', value: 71 },
      { group: 'A', value: 78 },
      { group: 'B', value: 55 },
      { group: 'B', value: 68 },
      { group: 'B', value: 90 },
    ]}
    axisBottom={{ legend: 'Class' }}
    axisLeft={{ legend: 'Score' }}
  />
</MaidrNivo>
```

With `subGroupBy`, Nivo draws the sub-groups side by side within each group. Each sub-group becomes its own layer, named after the sub-group. Use Page Up and Page Down to switch between them. `layout="horizontal"` is read as a horizontal box plot. `groupBy`, `groups`, `subGroups` and a `value` accessor are honoured.

The highlight outlines each part of a box: the box itself, the median line and the whisker caps. A horizontal box is drawn by Nivo as a rotated vertical one, so its 25% and 75% sections outline the whole box rather than a single edge.

Switching between sub-group layers keeps the group and the section you are on: from "Morning, 25%" in one sub-group, Page Up moves to "Morning, 25%" in the next.

## Multiple Charts per Page

Each `<MaidrNivo>` is independent. Its selectors are scoped to its own container element, so two Nivo charts on one page never highlight each other's marks. Give each one a distinct `id`.

```tsx
<>
  <MaidrNivo id="revenue" title="Revenue" type="bar">
    <Bar width={600} height={300} data={revenue} keys={['value']} indexBy="quarter" />
  </MaidrNivo>
  <MaidrNivo id="users" title="Users" type="line">
    <Line width={600} height={300} data={users} />
  </MaidrNivo>
</>
```

The adapter does not build multi-panel figures. One `<MaidrNivo>` holds one Nivo chart and becomes one MAIDR figure.

## Using the Hook

For full control over rendering, use the `useNivoAdapter` hook with the low-level `<Maidr>` component. Pass the chart kind and the same props object you render the chart with, plus a ref to the element that contains the chart, so the adapter can find its SVG marks.

```tsx
import { Line } from '@nivo/line';
import { useNivoAdapter } from 'maidr/nivo';
import { Maidr } from 'maidr/react';
import { useRef } from 'react';

const props = {
  width: 600,
  height: 400,
  data: [{ id: 'trend', data: [{ x: 1, y: 10 }, { x: 2, y: 20 }] }],
  axisBottom: { legend: 'Step' },
  axisLeft: { legend: 'Value' },
};

function AccessibleLineChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const maidrData = useNivoAdapter(
    { id: 'trend', title: 'Trend', type: 'line', props },
    containerRef,
  );

  return (
    <Maidr data={maidrData}>
      <div ref={containerRef}>
        <Line {...props} />
      </div>
    </Maidr>
  );
}
```

The hook returns data on the first render and adds the highlight selectors once the chart is in the DOM. It keeps watching the container, so a `Responsive*` chart that draws only after it has measured its size, or a chart that redraws, still gets its highlight.

### Without React: `nivoToMaidr`

`nivoToMaidr(config, scope?)` is a pure function that converts the same config into `MaidrData` without touching the DOM. It suits server rendering or building a MAIDR JSON payload ahead of time. With a `scope`, a CSS selector prefix for the element the chart renders in (for example `'#sales-chart '`), it emits selectors for the marks Nivo labels itself: bars, pie slices, heatmap cells and boxes. Line and scatter marks carry no such labels, so they are highlighted only through `useNivoAdapter` or `<MaidrNivo>`, which tag them after render.

```ts
import { nivoToMaidr } from 'maidr/nivo';

const maidrData = nivoToMaidr(
  {
    id: 'sales-chart',
    title: 'Quarterly Revenue',
    type: 'bar',
    props: { data, keys: ['revenue'], indexBy: 'quarter' },
  },
  '#sales-chart ',
);
```

## TypeScript Types

All types are exported from `maidr/nivo`:

```tsx
import {
  extractNivoLayers, // Lower-level: (type, props) → layer info
  MaidrNivo, // The wrapper component
  nivoToMaidr, // Pure converter: config → MaidrData
  toMaidrLayer, // Lower-level: layer info → MAIDR layer
  useNivoAdapter, // The conversion hook
  type MaidrNivoProps, // Props for MaidrNivo
  type NivoAdapterConfig, // Config accepted by the hook and nivoToMaidr
  type NivoChartType, // 'bar' | 'line' | 'scatterplot' | 'pie' | 'heatmap' | 'boxplot'
  type NivoLayerData, // Extracted layer payload union
  type NivoLayerInfo, // Intermediate layer representation
  type NivoMarks, // How a layer's marks are found in the SVG
} from 'maidr/nivo';
```

`maidr/nivo` also re-exports `MaidrData`, `MaidrLayer`, `MaidrSubplot`, `Orientation` and `TraceType` from the core.

### `NivoAdapterConfig`

```typescript
interface NivoAdapterConfig {
  id: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  type: NivoChartType;
  props: Readonly<Record<string, unknown>>; // the chart's props, read only
}
```

## Advanced

### How It Works

`<MaidrNivo>` is a convenience wrapper that:

1. Finds the Nivo chart element among its children and reads its props (`findNivoChartProps`).
2. Converts those props into MAIDR layers for the declared `type` (`extractNivoLayers`, `toMaidrLayer`).
3. Builds highlight selectors from the rendered SVG, scoped to the wrapper's container so they cannot reach another chart on the page:
   - bars, pie slices and heatmap cells by the `data-testid` Nivo gives them (`bar.item.<key>.<index>`, `arc.<id>`, `cell.<row>.<x>`);
   - boxes by their `data-key` (`boxplot.<group>.<subGroup>`);
   - line points and scatter nodes, which Nivo does not label, by tagging them with `data-maidr-nivo-*` attributes in render order. The tags are reapplied when Nivo replaces the elements.
4. Keeps the highlight on the marks when Nivo moves them in place, on a resize or while it animates in. Bars, slices, cells, line points and scatter nodes follow; the parts of a box keep the position they had when the chart was focused, until it is focused again.
5. Renders the children inside the `<Maidr>` component.

If a future Nivo version changes these attributes or its drawing order, only the highlight is affected. Audio, text and braille still work.

### Nivo vs React (Low-Level)

| Feature | Nivo Adapter | React (Low-Level) |
|---------|--------------|-------------------|
| Import | `import { MaidrNivo } from 'maidr/nivo'` | `import { Maidr } from 'maidr/react'` |
| Data format | Read from the Nivo chart's props | MAIDR typed structures |
| Configuration | Wrap the chart and declare `type` | Manual `MaidrData` JSON |
| Chart types | 6 Nivo packages | All MAIDR trace types |
| SVG highlighting | Automatic (SVG components only) | Manual `selectors` setup |
| Best for | Nivo projects | Custom SVG / other libraries |

## Limitations

- `type` must be declared. The adapter cannot infer it from the element.
- `*Canvas` components are read but not highlighted.
- One chart per `<MaidrNivo>`, and no multi-panel figures.
- `valueScale.reverse` is ignored. Nivo's band scale has no `reverse` option, so `indexScale.reverse` changes nothing either.
- A pie with `sortByValue` has no highlight.
- Box plots are read from Nivo's computed quantiles. They have no Tukey whiskers and no outliers, because Nivo draws neither.
- Other Nivo packages (`@nivo/stream`, `@nivo/radar`, `@nivo/sunburst`, and so on) are not supported yet.

## Keyboard Controls

Once a chart is focused, the following keyboard shortcuts are available:

| Function | Key (Windows) | Key (Mac) |
|----------|--------------|-----------|
| Move around plot | Arrow keys | Arrow keys |
| Go to extremes | Ctrl + Arrow | Cmd + Arrow |
| Switch layer | Page Up / Page Down | Page Up / Page Down |
| Toggle Braille Mode | B | B |
| Toggle Sonification | S | S |
| Toggle Text Mode | T | T |
| Toggle Review Mode | R | R |
| Auto-play | Ctrl + Shift + Arrow | Cmd + Shift + Arrow |
| Stop Auto-play | Ctrl | Cmd |
| Open Settings | Ctrl + , | Cmd + , |
| Open Command Palette | Ctrl + Shift + P | Cmd + Shift + P |

For a complete list, see the [Controls documentation](CONTROLS.md).
