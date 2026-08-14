# Recharts Integration


MAIDR provides a dedicated adapter for [Recharts](https://recharts.org) that automatically converts Recharts data into MAIDR's accessible format. Simply wrap your Recharts chart with `<MaidrRecharts>` and provide a few configuration props -- no need to manually build MAIDR's JSON data structure.

## Installation

```bash
npm install maidr@latest recharts
```

MAIDR requires React 18 or 19 as a peer dependency:

```bash
npm install react react-dom
```

## Quick Start

Import `MaidrRecharts` from `maidr/recharts` and wrap your Recharts chart:

```tsx
import { MaidrRecharts } from 'maidr/recharts';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const data = [
  { quarter: 'Q1', revenue: 4200 },
  { quarter: 'Q2', revenue: 5800 },
  { quarter: 'Q3', revenue: 3900 },
  { quarter: 'Q4', revenue: 7100 },
];

function AccessibleBarChart() {
  return (
    <MaidrRecharts
      id="sales-chart"
      title="Quarterly Revenue"
      data={data}
      chartType="bar"
      xKey="quarter"
      yKeys={['revenue']}
      xLabel="Quarter"
      yLabel="Revenue ($)"
    >
      <BarChart width={600} height={350} data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="quarter" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="revenue" fill="#8884d8" />
      </BarChart>
    </MaidrRecharts>
  );
}
```


## Props Reference

### `<MaidrRecharts>`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the chart (used for DOM IDs). |
| `children` | `ReactNode` | Yes | Recharts chart component(s) to make accessible. |
| `data` | `Record<string, unknown>[]` | Simple/composed mode | Recharts data array. Each item is one data point with named fields. In subplot mode it is the default data for panels without their own `data`. |
| `xKey` | `string` | Yes | Key in data objects for x-axis values. |
| `chartType` | `RechartsChartType` | Simple mode | Chart type (see supported types below). |
| `yKeys` | `string[]` | Simple mode | Keys in data objects for y-axis values. Each key is a data series. Not used by `parallel`, `ridgeline` and `boxen`, whose fields are all named by their own config; on a `hexbin` the first entry is the bin centre's y. |
| `layers` | `RechartsLayerConfig[]` | Composed mode | Layer configs for mixed chart types (see Composed Charts). |
| `subplots` | `RechartsSubplotConfig[][]` or `RechartsSubplotConfig[]` | Subplot mode | Panel grid for multi-panel (faceted) figures (see Multi-Panel Charts). Mutually exclusive with `chartType`/`layers`. |
| `columns` | `number` | No | Panels per row when `subplots` is a flat array. Ignored for 2D grids. |
| `title` | `string` | No | Chart title displayed in text descriptions. |
| `subtitle` | `string` | No | Chart subtitle. |
| `caption` | `string` | No | Chart caption. |
| `xLabel` | `string` | No | X-axis label. |
| `yLabel` | `string` | No | Y-axis label. |
| `orientation` | `Orientation` | No | Bar orientation. Defaults to vertical. |
| `fillKeys` | `string[]` | No | Display names for series in stacked/dodged/normalized charts. Maps 1:1 with `yKeys`. |
| `binConfig` | `HistogramBinConfig` | Histogram only | Bin range configuration for histograms. |
| `flowConfig` | `FlowLinkConfig` | Alluvial only | Target key and the `nodes` half of the `<Sankey>` data. |
| `volcanoConfig` | `VolcanoPointConfig` | Volcano/Manhattan | Point labels, chromosome key and the significance/effect cutoffs. |
| `errorConfig` | `ErrorIntervalConfig` | Error bar/forest | Which field holds the interval, as an offset or as absolute bounds. |
| `forestConfig` | `ForestPlotConfig` | Forest only | Study weights, the pooled row, and the null line. |
| `survivalConfig` | `SurvivalCurveConfig` | Survival only | Per-arm censoring and confidence band keys, and the step direction. |
| `parallelConfig` | `ParallelAxesConfig` | Parallel only | The axes in draw order, naming the raw fields, and the observation's label key. |
| `ridgelineConfig` | `RidgelineCurveConfig` | Ridgeline only | Group key, value key, and the density key — the density BEFORE the ridge offset. |
| `hexbinConfig` | `HexbinLatticeConfig` | Hexbin | Bin centre, count and lattice row keys. |
| `boxenConfig` | `BoxenLadderConfig` | Boxen | Median, ladder and outlier keys. |
| `selectorOverride` | `string` | No | Custom CSS selector for SVG highlighting (see Advanced section). |

## Configuration Modes

### Simple Mode

Use `chartType` + `yKeys` when your chart has a single chart type:

```tsx
<MaidrRecharts
  id="my-chart"
  data={data}
  chartType="bar"       // Single chart type
  xKey="month"
  yKeys={['revenue']}   // One or more data series
  xLabel="Month"
  yLabel="Revenue"
>
  {/* Recharts component */}
</MaidrRecharts>
```

### Composed Mode

Use `layers` when your chart mixes different chart types (e.g., bar + line):

```tsx
<MaidrRecharts
  id="my-chart"
  data={data}
  xKey="month"
  layers={[                                              // Mixed chart types
    { yKey: 'revenue', chartType: 'bar', name: 'Revenue' },
    { yKey: 'trend', chartType: 'line', name: 'Trend' },
  ]}
  xLabel="Month"
  yLabel="Value"
>
  {/* Recharts ComposedChart component */}
</MaidrRecharts>
```

### Subplot Mode (Multi-Panel)

Use `subplots` when your figure is a grid of small multiples (faceted charts). See [Multi-Panel (Faceted) Charts](#multi-panel-faceted-charts) below.

## Supported Chart Types

| `chartType` value | Recharts Component | Description |
|---|---|---|
| `'bar'` | `<Bar>` | Simple bar chart |
| `'stacked_bar'` | `<Bar stackId="...">` | Stacked bar chart (multiple `yKeys`) |
| `'dodged_bar'` | Multiple `<Bar>` | Grouped/side-by-side bar chart (multiple `yKeys`) |
| `'normalized_bar'` | `<Bar stackId="...">` | 100% stacked bar chart (multiple `yKeys`) |
| `'diverging_bar'` | `<BarChart stackOffset="sign">` | Population pyramid / Likert: two sides of a shared baseline (exactly two `yKeys`) |
| `'waterfall'` | `<Bar>` with a `[start, end]` `dataKey` | A total carried through signed contributions (`waterfallConfig`) |
| `'dumbbell'` | `<Bar>` with a `[start, end]` `dataKey` | Two values compared per category (exactly two `yKeys`) |
| `'gantt'` | `<BarChart layout="vertical">` + floating `<Bar>` | Intervals laid out in lanes (`ganttConfig`) |
| `'gauge'` | `<RadialBarChart>` + `<RadialBar>` | One measure against a range (`gaugeConfig`) |
| `'dot'` | `<Scatter>` | Cleveland dot plot: one point per category |
| `'lollipop'` | `<Bar barSize={2}>` + `<Scatter>` | Lollipop chart: a stem and a head |
| `'funnel'` | `<FunnelChart>` + `<Funnel>` | Funnel chart: a population shrinking across ordered stages |
| `'histogram'` | `<Bar>` | Histogram with bin ranges (requires `binConfig`) |
| `'line'` | `<Line>` | Line chart |
| `'area'` | `<Area>` | Area chart |
| `'stacked_area'` | `<Area stackId="...">` | Stacked area chart (multiple `yKeys`) |
| `'normalized_area'` | `<AreaChart stackOffset="expand">` | 100% stacked area chart (multiple `yKeys`) |
| `'radar'` | `<RadarChart>` + `<Radar>` | Radar/spider chart |
| `'polar_area'` | `<Pie>` with equal angles and a per-datum `outerRadius` | Coxcomb/rose chart: a radar drawn as wedges |
| `'bump'` | `<LineChart>` + `<YAxis reversed>` | Bump chart: rank over time |
| `'survival'` | `<Line type="stepAfter">` | Kaplan-Meier curve (optional `survivalConfig`) |
| `'scatter'` | `<Scatter>` | Scatter/point plot |
| `'volcano'` | `<ScatterChart>` + `<Scatter>` | Volcano plot: effect size against significance (`volcanoConfig`) |
| `'manhattan'` | `<ScatterChart>` + `<Scatter>` | Manhattan plot: genomic position against significance (`volcanoConfig`) |
| `'error_bar'` | `<ErrorBar>` inside `<Bar>`/`<Line>`/`<Scatter>` | An estimate with its interval (`errorConfig`) |
| `'forest'` | `<ScatterChart layout="vertical">` + `<ErrorBar direction="x">` | Forest plot (`errorConfig` + `forestConfig`) |
| `'pie'` | `<Pie>` | Pie chart (a doughnut is a `<Pie>` with an `innerRadius`) |
| `'alluvial'` | `<Sankey>` | Weighted flow between nodes (`flowConfig`) |
| `'sankey'` | `<Sankey>` | The same flow drawn as a left-to-right budget (`flowConfig`) |
| `'treemap'` | `<Treemap>` | A hierarchy laid out as nested area (nested `data`) |
| `'sunburst'` | `<SunburstChart>` | The same hierarchy drawn as rings (nested `data`) |
| `'icicle'` | `<BarChart layout="vertical">` + floating `<Bar>` | The same hierarchy drawn as depth-ordered bands (nested `data`) |
| `'parallel'` | `<LineChart>` + one `<Line>` per observation | Parallel coordinates: an axis per variable (`parallelConfig`) |
| `'ridgeline'` | Overlapping `<Area>`s, one per group | Ridgeline/joy plot: a density curve per group (`ridgelineConfig`) |
| `'hexbin'` | `<Scatter shape={hexagon}>` | Hexagonal binning of an overplotted scatter (`hexbinConfig`) |
| `'boxen'` | Stacked `<Bar>`s over a transparent base | Letter-value plot: a variable-depth quantile ladder (`boxenConfig`) |

## Data Examples by Chart Type

### Bar Chart

```tsx
const data = [
  { quarter: 'Q1', revenue: 4200 },
  { quarter: 'Q2', revenue: 5800 },
  { quarter: 'Q3', revenue: 3900 },
  { quarter: 'Q4', revenue: 7100 },
];

<MaidrRecharts
  id="bar-example"
  title="Quarterly Revenue"
  data={data}
  chartType="bar"
  xKey="quarter"
  yKeys={['revenue']}
  xLabel="Quarter"
  yLabel="Revenue ($)"
>
  <BarChart width={600} height={350} data={data}>
    <XAxis dataKey="quarter" />
    <YAxis />
    <Bar dataKey="revenue" fill="#8884d8" />
  </BarChart>
</MaidrRecharts>
```

### Stacked Bar Chart

Multiple `yKeys` with `chartType="stacked_bar"`. Use `fillKeys` for display names:

```tsx
const data = [
  { month: 'Jan', electronics: 4000, clothing: 2400, food: 1800 },
  { month: 'Feb', electronics: 3000, clothing: 1398, food: 2200 },
  { month: 'Mar', electronics: 2000, clothing: 3800, food: 2500 },
];

<MaidrRecharts
  id="stacked-example"
  title="Sales by Category"
  data={data}
  chartType="stacked_bar"
  xKey="month"
  yKeys={['electronics', 'clothing', 'food']}
  fillKeys={['Electronics', 'Clothing', 'Food']}
  xLabel="Month"
  yLabel="Sales ($)"
>
  <BarChart width={600} height={350} data={data}>
    <XAxis dataKey="month" />
    <YAxis />
    <Bar dataKey="electronics" stackId="a" fill="#8884d8" />
    <Bar dataKey="clothing" stackId="a" fill="#82ca9d" />
    <Bar dataKey="food" stackId="a" fill="#ffc658" />
  </BarChart>
</MaidrRecharts>
```

### Dodged (Grouped) Bar Chart

```tsx
<MaidrRecharts
  id="dodged-example"
  title="Sales Comparison"
  data={data}
  chartType="dodged_bar"
  xKey="month"
  yKeys={['electronics', 'clothing', 'food']}
  fillKeys={['Electronics', 'Clothing', 'Food']}
  xLabel="Month"
  yLabel="Sales ($)"
>
  <BarChart width={600} height={350} data={data}>
    <XAxis dataKey="month" />
    <YAxis />
    {/* No stackId = dodged/grouped layout */}
    <Bar dataKey="electronics" fill="#8884d8" />
    <Bar dataKey="clothing" fill="#82ca9d" />
    <Bar dataKey="food" fill="#ffc658" />
  </BarChart>
</MaidrRecharts>
```

### Dot Plot and Lollipop Chart

Both read exactly as a bar chart does — one category, one magnitude — and take the same config. What differs is the mark, and therefore what MAIDR highlights.

A Cleveland dot plot is a `<Scatter>` against a category axis:

```tsx
const data = [
  { role: 'Nurse', pay: 62 },
  { role: 'Teacher', pay: 54 },
  { role: 'Engineer', pay: 88 },
];

<MaidrRecharts
  id="dot-example"
  title="Median Pay by Role"
  data={data}
  chartType="dot"
  xKey="role"
  yKeys={['pay']}
  xLabel="Role"
  yLabel="Median pay ($k)"
>
  <ScatterChart width={600} height={350}>
    <XAxis dataKey="role" type="category" allowDuplicatedCategory={false} />
    <YAxis dataKey="pay" type="number" />
    <Scatter data={data} fill="#8884d8" />
  </ScatterChart>
</MaidrRecharts>
```

A lollipop has no Recharts primitive; compose a thin `<Bar>` stem with a `<Scatter>` head:

```tsx
<MaidrRecharts
  id="lollipop-example"
  title="Market Share by Country"
  data={data}
  chartType="lollipop"
  xKey="country"
  yKeys={['share']}
  xLabel="Country"
  yLabel="Share (%)"
>
  <ComposedChart width={600} height={350} data={data}>
    <XAxis dataKey="country" />
    <YAxis />
    <Bar dataKey="share" barSize={2} fill="#8884d8" />
    <Scatter dataKey="share" fill="#8884d8" />
  </ComposedChart>
</MaidrRecharts>
```

Highlighting targets the head (`.recharts-scatter-symbol .recharts-symbols`), not the stem, because the head is where the value is read off. If you draw the lollipop with a custom `<Bar>` shape that renders its own dot, pass a `selectorOverride` pointing at that element instead.

### Funnel Chart

`xKey` is the stage label and the single `yKeys` entry its count, in the order the stages are drawn:

```tsx
const data = [
  { stage: 'Visited', users: 10000 },
  { stage: 'Signed up', users: 2400 },
  { stage: 'Activated', users: 2300 },
  { stage: 'Paid', users: 100 },
];

<MaidrRecharts
  id="funnel-example"
  title="Signup Funnel"
  data={data}
  chartType="funnel"
  xKey="stage"
  yKeys={['users']}
  xLabel="Stage"
  yLabel="Users"
>
  <FunnelChart width={600} height={350}>
    <Funnel dataKey="users" nameKey="stage" data={data} fill="#8884d8">
      <LabelList position="right" dataKey="stage" />
    </Funnel>
  </FunnelChart>
</MaidrRecharts>
```

Pass the counts, never a pre-computed ratio. MAIDR sonifies the **retention** — what fraction of the previous stage survived — because that is the number a funnel is read for and the one a listener cannot take by ear from two heights heard one at a time: 2,300 to 100 keeps 4% while 10,000 to 2,400 keeps 24%, and on a raw scale the second sounds like the bigger fall.

A funnel is never given an `orientation`. `FunnelTrace` is a bar trace, and a horizontal bar reads its category off `y`, so a leaked `orientation` would have every stage announced by its count.

### Histogram

Requires `binConfig` to specify which data keys contain the bin edges:

```tsx
const data = [
  { bin: '0-10', count: 5, xMin: 0, xMax: 10 },
  { bin: '10-20', count: 12, xMin: 10, xMax: 20 },
  { bin: '20-30', count: 8, xMin: 20, xMax: 30 },
  { bin: '30-40', count: 3, xMin: 30, xMax: 40 },
];

<MaidrRecharts
  id="histogram-example"
  title="Score Distribution"
  data={data}
  chartType="histogram"
  xKey="bin"
  yKeys={['count']}
  binConfig={{ xMinKey: 'xMin', xMaxKey: 'xMax' }}
  xLabel="Score Range"
  yLabel="Frequency"
>
  <BarChart width={600} height={350} data={data}>
    <XAxis dataKey="bin" />
    <YAxis />
    <Bar dataKey="count" fill="#8884d8" />
  </BarChart>
</MaidrRecharts>
```

### Line Chart

```tsx
const data = [
  { month: 'Jan', users: 400 },
  { month: 'Feb', users: 600 },
  { month: 'Mar', users: 550 },
  { month: 'Apr', users: 780 },
];

<MaidrRecharts
  id="line-example"
  title="Monthly Active Users"
  data={data}
  chartType="line"
  xKey="month"
  yKeys={['users']}
  xLabel="Month"
  yLabel="Active Users"
>
  <LineChart width={600} height={350} data={data}>
    <XAxis dataKey="month" />
    <YAxis />
    <Line type="monotone" dataKey="users" stroke="#8884d8" dot />
  </LineChart>
</MaidrRecharts>
```

> **Tip:** Always include `dot` on the `<Line>` component. MAIDR uses the rendered dot elements for visual highlighting during keyboard navigation.

### Area Chart

```tsx
const data = [
  { month: 'Jan', mm: 80 },
  { month: 'Feb', mm: 65 },
  { month: 'Mar', mm: 90 },
];

<MaidrRecharts
  id="area-example"
  title="Monthly Rainfall"
  data={data}
  chartType="area"
  xKey="month"
  yKeys={['mm']}
  xLabel="Month"
  yLabel="Rainfall (mm)"
>
  <AreaChart width={600} height={350} data={data}>
    <XAxis dataKey="month" />
    <YAxis />
    <Area type="monotone" dataKey="mm" stroke="#8884d8" fill="#8884d8" dot />
  </AreaChart>
</MaidrRecharts>
```

> **Tip:** As with `<Line>`, include `dot` on the `<Area>`. The filled band is a single path with nothing per sample to highlight, so the dots are the only marks MAIDR can align to the data.

### Stacked and 100% Stacked Area

Use `stacked_area` for `<Area stackId="...">` and `normalized_area` when the chart also sets `stackOffset="expand"`. Pass each band's **own** value — not the accumulated top edge, and not the expanded fraction. MAIDR sums the series itself to announce the running total and each point's share of it:

```tsx
const data = [
  { month: 'Jan', organic: 40, paid: 20 },
  { month: 'Feb', organic: 55, paid: 15 },
];

<MaidrRecharts
  id="stacked-area-example"
  title="Sessions by Source"
  data={data}
  chartType="stacked_area"
  xKey="month"
  yKeys={['organic', 'paid']}
  xLabel="Month"
  yLabel="Sessions"
>
  <AreaChart width={600} height={350} data={data}>
    <XAxis dataKey="month" />
    <YAxis />
    <Area type="monotone" dataKey="organic" stackId="a" stroke="#8884d8" fill="#8884d8" dot />
    <Area type="monotone" dataKey="paid" stackId="a" stroke="#82ca9d" fill="#82ca9d" dot />
  </AreaChart>
</MaidrRecharts>
```

A stacked area declared over a single `yKey` falls back to `'area'`: one band is not stacked against anything, and announcing a total equal to the point's own value on every sample is noise rather than information.

### Radar Chart

`xKey` is the `<PolarAngleAxis dataKey>` (the spoke) and each entry in `yKeys` is one `<Radar>`:

```tsx
const data = [
  { attribute: 'Speed', alice: 90, bob: 70 },
  { attribute: 'Power', alice: 60, bob: 85 },
  { attribute: 'Stamina', alice: 75, bob: 80 },
];

<MaidrRecharts
  id="radar-example"
  title="Player Attributes"
  data={data}
  chartType="radar"
  xKey="attribute"
  yKeys={['alice', 'bob']}
  xLabel="Attribute"
  yLabel="Rating"
>
  <RadarChart width={500} height={400} data={data}>
    <PolarGrid />
    <PolarAngleAxis dataKey="attribute" />
    <Radar dataKey="alice" stroke="#8884d8" fill="#8884d8" fillOpacity={0.4} dot />
    <Radar dataKey="bob" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.4} dot />
  </RadarChart>
</MaidrRecharts>
```

MAIDR pans each spoke to its position around the circle — 12 o'clock centre, 3 o'clock hard right, 6 o'clock centre again — so a radar sounds like a circle rather than a row of bars.

### Polar Area (Coxcomb) Chart

A coxcomb, rose or Nightingale chart is a radar drawn as **wedges**: the same categories around the same circle, with the value as the radius rather than as a point on an outline. Recharts draws it as a `<Pie>` whose slices are all the same angle and whose `outerRadius` is a function of the datum:

```tsx
const data = [
  { month: 'Jan', deaths: 120, slice: 1 },
  { month: 'Feb', deaths: 84, slice: 1 },
  { month: 'Mar', deaths: 61, slice: 1 },
];

<MaidrRecharts
  id="coxcomb-example"
  title="Deaths by Month"
  data={data}
  chartType="polar_area"
  xKey="month"
  yKeys={['deaths']}
  xLabel="Month"
  yLabel="Deaths"
>
  <PieChart width={400} height={400}>
    <Pie
      data={data}
      dataKey="slice"
      nameKey="month"
      outerRadius={d => 40 + d.deaths}
      fill="#8884d8"
    />
  </PieChart>
</MaidrRecharts>
```

Note which field goes where. The `<Pie dataKey>` is the constant that makes every wedge the same **angle**; `yKeys` names the measure, which is the **radius**. Point `yKeys` at the pie's `dataKey` and every spoke announces the same number.

MAIDR reads this exactly as it reads a radar — the two differ in the mark, not in what a reader navigates — so each wedge is panned to its position around the circle. Highlighting targets the pie's sectors, and carries the pie's one caveat: Recharts draws no sector at all for a zero-value slice, and a count mismatch turns highlighting off for the layer while audio, text and braille still describe every spoke.

A `<RadialBarChart>` is **not** this chart. It puts the categories on concentric rings and encodes the value as the sweep angle, which is a different figure with a different reading.

### Bump Chart

A bump chart is rank over time: a `<LineChart>` with `<YAxis reversed>` so rank 1 sits at the top. Each `yKey` holds the competitor's **rank** in that period, never the underlying value:

```tsx
const data = [
  { matchday: 1, arsenal: 3, chelsea: 1 },
  { matchday: 2, arsenal: 1, chelsea: 2 },
  { matchday: 3, arsenal: 1, chelsea: 3 },
];

<MaidrRecharts
  id="bump-example"
  title="League Position by Matchday"
  data={data}
  chartType="bump"
  xKey="matchday"
  yKeys={['arsenal', 'chelsea']}
  xLabel="Matchday"
  yLabel="Position"
>
  <LineChart width={600} height={350} data={data}>
    <XAxis dataKey="matchday" />
    <YAxis reversed allowDecimals={false} />
    <Line type="linear" dataKey="arsenal" stroke="#8884d8" dot />
    <Line type="linear" dataKey="chelsea" stroke="#82ca9d" dot />
  </LineChart>
</MaidrRecharts>
```

> **Warning:** MAIDR inverts the pitch for a bump chart so rank 1 is the highest note, and announces the places gained or lost since the previous period. Declaring a chart of *values* as `'bump'` therefore sonifies it upside down — every rise heard as a fall. The adapter cannot tell the two apart, so this one is on you.

### Survival Curve

A Kaplan-Meier curve is a `<Line type="stepAfter">`. One `yKeys` entry per arm, and the per-arm keys in `survivalConfig` line up with it the way `fillKeys` does:

```tsx
const data = [
  { months: 0, treated: 1.0, control: 1.0, treatedCensored: false },
  { months: 6, treated: 0.88, control: 0.74, treatedCensored: true },
  { months: 12, treated: 0.77, control: 0.52, treatedCensored: false },
];

<MaidrRecharts
  id="survival-example"
  title="Overall Survival"
  data={data}
  chartType="survival"
  xKey="months"
  yKeys={['treated', 'control']}
  fillKeys={['Treatment', 'Control']}
  survivalConfig={{ censoredKeys: ['treatedCensored'] }}
  xLabel="Months"
  yLabel="Survival probability"
>
  <LineChart width={600} height={350} data={data}>
    <XAxis dataKey="months" />
    <YAxis domain={[0, 1]} />
    <Line type="stepAfter" dataKey="treated" stroke="#8884d8" dot />
    <Line type="stepAfter" dataKey="control" stroke="#82ca9d" dot />
  </LineChart>
</MaidrRecharts>
```

Censoring is not an event: the curve does not step at a censored time, which is exactly why a reader has to be told about it — a flat tail backed by two hundred subjects and one backed by three are indistinguishable otherwise. MAIDR offers a rotor mode that jumps between the censored times.

The layer declares `stepDirection: 'hv'`, which is what `type="stepAfter"` draws. Set `survivalConfig.stepDirection` to `'vh'` for a curve drawn with `type="stepBefore"`.

Add a confidence band with `yMinKeys`/`yMaxKeys`; the bounds are absolute positions on the value axis, not offsets.

### Scatter Chart

```tsx
const data = [
  { height: 65, weight: 150 },
  { height: 70, weight: 175 },
  { height: 62, weight: 130 },
  { height: 68, weight: 165 },
];

<MaidrRecharts
  id="scatter-example"
  title="Height vs Weight"
  data={data}
  chartType="scatter"
  xKey="height"
  yKeys={['weight']}
  xLabel="Height (in)"
  yLabel="Weight (lbs)"
>
  <ScatterChart width={600} height={350}>
    <XAxis dataKey="height" type="number" />
    <YAxis dataKey="weight" type="number" />
    <Scatter data={data} fill="#8884d8" />
  </ScatterChart>
</MaidrRecharts>
```

### Volcano and Manhattan Plots

Both are scatters read almost entirely through a threshold, and both need two things a Recharts `<Scatter>` does not hold: what each point *is*, and where the cutoffs are.

```tsx
const data = [
  { gene: 'TP53', log2fc: 2.4, negLog10P: 14.1 },
  { gene: 'MYC', log2fc: -0.3, negLog10P: 0.8 },
];

<MaidrRecharts
  id="volcano-example"
  title="Differential Expression"
  data={data}
  chartType="volcano"
  xKey="log2fc"
  yKeys={['negLog10P']}
  volcanoConfig={{ labelKey: 'gene', significance: 1.3, effect: 1 }}
  xLabel="log2 fold change"
  yLabel="-log10(p)"
>
  <ScatterChart width={600} height={350}>
    <XAxis dataKey="log2fc" type="number" />
    <YAxis dataKey="negLog10P" type="number" />
    <ReferenceLine y={1.3} strokeDasharray="4 4" />
    <Scatter data={data} fill="#8884d8" />
  </ScatterChart>
</MaidrRecharts>
```

There is no default cutoff, deliberately: -log10(p) puts the line at 1.3 for p < 0.05 and at 7.3 for genome-wide significance, and a guessed line sorts every point on the figure onto the wrong side silently. A **raw p axis runs the other way** and must declare `significanceDirection: 'below'` — fixed to `above` it would select exactly the points that failed to reach significance and announce them as the result.

A Manhattan plot uses `chartType="manhattan"` with the same config, plus `groupKey` for the chromosome. Point `xKey` at the **per-chromosome position, not the cumulative offset the chart plots**: the offset keeps the chromosomes side by side on screen, and "position 249,388,120" answers nothing a reader asked.

```tsx
<MaidrRecharts
  id="manhattan-example"
  data={data}
  chartType="manhattan"
  xKey="bp"                   // announced
  yKeys={['negLog10P']}
  volcanoConfig={{ labelKey: 'snp', groupKey: 'chr', significance: 7.3 }}
>
  <ScatterChart width={600} height={350}>
    <XAxis dataKey="cumulative" type="number" tick={false} />  {/* drawn */}
    <YAxis dataKey="negLog10P" type="number" />
    <Scatter data={data} fill="#8884d8" />
  </ScatterChart>
</MaidrRecharts>
```

A chart drawn as one `<Scatter>` per chromosome still emits a single MAIDR layer, so list the points in the order the `<Scatter>` elements are declared — highlighting pairs marks to points by index.

### Error Bars

MAIDR fixes the interval as **absolute positions on the value axis**, while Recharts' `<ErrorBar dataKey>` points at an **offset** from the estimate. Declare whichever your data holds:

```tsx
const data = [
  { treatment: 'Control', mean: 4.2, sd: 0.6 },
  { treatment: 'Nitrogen', mean: 5.5, sd: 0.5 },
];

<MaidrRecharts
  id="error-bar-example"
  title="Yield by Treatment"
  data={data}
  chartType="error_bar"
  xKey="treatment"
  yKeys={['mean']}
  errorConfig={{ errorKey: 'sd' }}    // an offset, as <ErrorBar> reads it
  xLabel="Treatment"
  yLabel="Yield (t/ha)"
>
  <BarChart width={600} height={350} data={data}>
    <XAxis dataKey="treatment" />
    <YAxis />
    <Bar dataKey="mean" fill="#8884d8">
      <ErrorBar dataKey="sd" direction="y" />
    </Bar>
  </BarChart>
</MaidrRecharts>
```

- `errorKey` — the field the `<ErrorBar>` uses. A number is a symmetric offset; a `[lower, upper]` pair is an asymmetric one. The adapter resolves both to `y - lower` / `y + upper`, the same arithmetic Recharts does to place the whiskers.
- `yMinKey` / `yMaxKey` — absolute bounds, used as-is. These win when both are declared.

The bounds are independently optional: a one-sided interval is a real chart, and a missing half is left off rather than defaulted to the estimate.

Highlighting targets the whiskers, because the estimate's own mark may be a bar, a line dot or a scatter symbol depending on what you nested the `<ErrorBar>` in — pass the host's selector as `selectorOverride` to highlight that instead. Note that Recharts draws **no whisker at all** for a sample whose error value is zero or missing; MAIDR then sees fewer marks than samples and turns highlighting off for the layer rather than mis-aligning it.

### Forest Plot

A forest plot is an error bar chart on a categorical row axis, plus the two things that make it a meta-analysis:

```tsx
const studies = [
  { study: 'Silva 2018', or: 0.62, lower: 0.41, upper: 0.94, weight: 0.12 },
  { study: 'Okafor 2022', or: 1.71, lower: 1.22, upper: 2.40, weight: 0.55 },
  { study: 'Pooled', or: 1.28, lower: 1.02, upper: 1.61, pooled: true },
];

<MaidrRecharts
  id="forest-example"
  title="Effect of the intervention"
  data={studies}
  chartType="forest"
  xKey="study"
  yKeys={['or']}
  orientation={Orientation.HORIZONTAL}
  errorConfig={{ yMinKey: 'lower', yMaxKey: 'upper' }}
  forestConfig={{ weightKey: 'weight', pooledKey: 'pooled', nullValue: 1 }}
  xLabel="Study"
  yLabel="Odds ratio"
>
  <ScatterChart width={600} height={350} layout="vertical" margin={{ left: 80 }}>
    <XAxis dataKey="or" type="number" />
    <YAxis dataKey="study" type="category" width={80} />
    <ReferenceLine x={1} />
    <Scatter data={drawn} fill="#8884d8">
      <ErrorBar dataKey="offsets" direction="x" />
    </Scatter>
  </ScatterChart>
</MaidrRecharts>
```

- `nullValue` is the `<ReferenceLine>` the chart draws — 1 for a ratio measure, 0 for a difference. Whether a study's interval crosses it *is that study's result*, so MAIDR announces the crossing. There is no default: guessing 0 for a ratio chart would report every study as not crossing, since odds ratios are all positive. Omit it and the reading keeps the estimate, the interval and the weight, and makes no claim about significance.
- `weightKey` is how much the study contributed, as a fraction of one. A forest plot encodes it as marker *area*, which no reader is otherwise told — two studies whose intervals look alike can contribute wholly differently.
- The pooled summary is marked by `pooledKey` (a flag column) or `pooledIndex` (its row). It is not one more study, and announcing it as one invites a reader to count it among them.

Row order is the drawn order, with the pooled row wherever the chart puts it. Keep the `orientation` horizontal: the rows are studies and the values run across.

### Pie Chart

`xKey` is the `<Pie nameKey>` (the slice label) and the single entry in `yKeys` is its `dataKey` (the magnitude):

```tsx
const data = [
  { fruit: 'Apples', units: 30 },
  { fruit: 'Bananas', units: 50 },
  { fruit: 'Cherries', units: 20 },
];

<MaidrRecharts
  id="pie-example"
  title="Units Sold by Fruit"
  data={data}
  chartType="pie"
  xKey="fruit"
  yKeys={['units']}
  xLabel="Fruit"
  yLabel="Units"
>
  <PieChart width={500} height={400}>
    <Pie data={data} dataKey="units" nameKey="fruit" outerRadius={150} />
  </PieChart>
</MaidrRecharts>
```

Left and Right move between slices; Up and Down are out of bounds, since a pie is a single row. Each slice announces its label, its value, and its share of the whole — "Fruit is Apples, Units is 30, Percentage is 30.0%". Adding an `innerRadius` makes it a doughnut, which reads identically.

> Recharts draws no sector at all for a slice whose value is `0` (its start and end angles are both zero). MAIDR then sees fewer elements than slices and turns highlighting off for the layer rather than index-aligning the wrong wedges; audio, text, and braille still cover every slice.

### Alluvial and Sankey Diagrams

An alluvial is a `<Sankey>` whose node set repeats at each stage; a Sankey proper is one left-to-right budget of ribbons that split and rejoin. Both are the same weighted graph and take the same config — pass the `links` half of the Sankey data as `data`, and the `nodes` half through `flowConfig`:

```tsx
const nodes = [{ name: 'Free (Q1)' }, { name: 'Paid (Q1)' }, { name: 'Free (Q2)' }, { name: 'Paid (Q2)' }];
const links = [
  { source: 0, target: 2, value: 420 },
  { source: 0, target: 3, value: 130 },
  { source: 1, target: 3, value: 260 },
];

<MaidrRecharts
  id="alluvial-example"
  title="Cohort Movement"
  data={links}
  chartType="alluvial"
  xKey="source"
  yKeys={['value']}
  flowConfig={{ targetKey: 'target', nodes }}
  xLabel="Stage"
  yLabel="Accounts"
>
  <Sankey width={600} height={350} data={{ nodes, links }} link={{ stroke: '#8884d8' }} />
</MaidrRecharts>
```

`xKey` names the source field and the single `yKeys` entry the magnitude, so only the target needs a key of its own. Recharts addresses nodes by their index in the `nodes` array; the adapter resolves those indices back to names, because "flow from 1 to 3" names neither end. Links that already carry node names work without `nodes`.

Set `chartType="sankey"` for the budget reading. Nothing else changes: the payload, the config and the selector are identical, and which of the two a figure is is a fact about the data — whether a node reappears at each stage — rather than anything the adapter emits.

MAIDR reads both as a graph rather than a grid: following a ribbon is the primary move, and arrow keys step between a node and the flows that leave or arrive at it. Highlighting pairs each flow with the `<path class="recharts-sankey-link">` at the same position, so the `links` array order is the order the ribbons are announced in.

### Diverging Bar Chart (Population Pyramid)

Two series drawn back to back across a shared category axis. Declare **exactly two `yKeys`, the left-hand side first**, and give the left side **negative** values — the same numbers `<BarChart stackOffset="sign">` needs:

```tsx
const data = [
  { band: '0-9', men: -2_100_000, women: 2_000_000 },
  { band: '10-19', men: -1_900_000, women: 1_850_000 },
];

<MaidrRecharts
  id="pyramid-example"
  title="Population by Age Band"
  data={data}
  chartType="diverging_bar"
  xKey="band"
  yKeys={['men', 'women']}
  fillKeys={['Men', 'Women']}
  orientation={Orientation.HORIZONTAL}
  xLabel="Age band"
  yLabel="People"
>
  <BarChart width={600} height={400} layout="vertical" stackOffset="sign" data={data}>
    <XAxis type="number" />
    <YAxis type="category" dataKey="band" />
    <Bar dataKey="men" stackId="sides" fill="#8884d8" />
    <Bar dataKey="women" stackId="sides" fill="#82ca9d" />
  </BarChart>
</MaidrRecharts>
```

The sign is read as the **side**, not the magnitude: MAIDR pitches the size of the bar and announces which way it points, so the biggest bar on the left is not heard as the lowest note on the chart. It also announces the **balance** — what one side has over the other — at every band, which is the subtraction a pyramid is drawn back to back to support.

Order matters twice. The sides are read in **declaration order**, so the `yKeys` must run left then right, and the `<Bar>` elements must be declared in that same order for highlighting to land on the right one. Declared with a single `yKey` the layer falls back to a plain bar chart, since a pyramid with one side is not one.

### Waterfall Chart

The single `yKeys` entry names each step's **contribution**; the adapter accumulates the running totals, because a waterfall bar floats between the total before the step and the total after it and neither number is in the data.

```tsx
const data = [
  { step: 'Opening', change: 1200, restates: true },
  { step: 'New sales', change: 450 },
  { step: 'Churn', change: -180 },
  { step: 'Upsell', change: 90 },
  { step: 'Closing', restates: true },
];

<MaidrRecharts
  id="waterfall-example"
  title="Revenue Bridge"
  data={data}
  chartType="waterfall"
  xKey="step"
  yKeys={['change']}
  waterfallConfig={{ totalKey: 'restates' }}
  xLabel="Step"
  yLabel="Revenue ($k)"
>
  <BarChart width={600} height={350} data={steps}>
    <XAxis dataKey="x" />
    <YAxis />
    <Bar dataKey={(step) => [step.start, step.end]} fill="#8884d8" />
  </BarChart>
</MaidrRecharts>
```

A row flagged by `totalKey` (or listed in `totalIndices`, for data with no flag column) **restates** the running total rather than changing it — an opening balance, a subtotal, a closing balance. It sits on the baseline, and it need carry no number of its own: the `Closing` row above restates whatever the steps came to. `kindKey` names the kind outright when the data already holds it.

Draw the chart from a **floating bar** — a `<Bar>` whose `dataKey` returns a `[start, end]` pair — and it renders exactly one rectangle per step, which is what the default selector targets. Those are the same totals the adapter computes, so read them back off the layer instead of accumulating twice:

```tsx
const maidrData = useRechartsAdapter(config);
const steps = maidrData.subplots[0][0].layers[0].data as WaterfallPoint[];
```

The other recipe — a transparent offset `<Bar>` stacked under a visible one — draws **two** rectangles per step, and the default selector matches both. Give the visible bar a `className` and pass the narrowed selector as `selectorOverride`:

```tsx
<Bar dataKey="base" stackId="w" fill="transparent" />
<Bar dataKey="change" stackId="w" className="wf-delta" />
// selectorOverride: '.wf-delta .recharts-bar-rectangle .recharts-rectangle'
```

### Dumbbell Chart

Two values compared at each category, joined by a segment. Two `yKeys`, the starting end first, and `fillKeys` names them:

```tsx
const data = [
  { country: 'Japan', then: 78.9, now: 84.6 },
  { country: 'Russia', then: 69.2, now: 68.9 },
];

<MaidrRecharts
  id="dumbbell-example"
  title="Life Expectancy, 1990 against 2020"
  data={data}
  chartType="dumbbell"
  xKey="country"
  yKeys={['then', 'now']}
  fillKeys={['1990', '2020']}
  xLabel="Country"
  yLabel="Years"
>
  <BarChart width={600} height={350} data={data}>
    <XAxis dataKey="country" />
    <YAxis />
    <Bar dataKey={(row) => [row.then, row.now]} fill="#8884d8" />
  </BarChart>
</MaidrRecharts>
```

The two names are the content of the comparison. Announced as "start" and "end", a chart of life expectancy in 1990 against 2020 tells a reader which dot they are on and not which year it is — which is the one thing the legend gives a sighted reader for free. MAIDR derives the change rather than taking it from the data, so a row that declined (Russia, above) is announced as a decrease without anything extra declared.

Highlighting pairs one element with each **row**, not with each dot: a chart draws one connector per row, so both ends highlight the same element. A dumbbell drawn as a `<ScatterChart>` with two `<Scatter>`s draws two symbols per row instead and needs a `selectorOverride` naming the connector shape.

### Gantt Chart

One data row is one interval: `xKey` names its lane and the two `yKeys` its start and end, both as positions on the same numeric axis.

```tsx
const data = [
  { task: 'Design', from: 0, to: 5, phase: 'Wireframes' },
  { task: 'Build', from: 3, to: 12, phase: 'Alpha' },
  { task: 'Build', from: 14, to: 18, phase: 'Beta' },
];

<MaidrRecharts
  id="gantt-example"
  title="Release Plan"
  data={data}
  chartType="gantt"
  xKey="task"
  yKeys={['from', 'to']}
  ganttConfig={{ lanes: ['Design', 'Build', 'Launch'], labelKey: 'phase', unit: 'days' }}
  xLabel="Task"
  yLabel="Day"
>
  <BarChart width={600} height={350} layout="vertical" data={data}>
    <XAxis type="number" />
    <YAxis type="category" dataKey="task" />
    <Bar dataKey={(row) => [row.from, row.to]} fill="#8884d8" />
  </BarChart>
</MaidrRecharts>
```

Declare `lanes` so that a lane with **nothing booked still exists** — `Launch` above holds no row, and nothing booked is a real statement about a schedule that a list grouped by task cannot make. A lane a row names but the list omits is appended rather than dropped. `unit` names what a unit of the axis is; without it the length of an interval is announced as a bare number.

Dates have to arrive as **epoch milliseconds**: a `Date` is not a position on a numeric axis.

MAIDR puts the interval's length on pitch and its start on stereo position, so two lanes whose work lines up sound like they line up. That is the overlap question answered by ear, and it is the reason a gantt gets a trace type rather than being read as a table.

Highlighting needs the rows **grouped by lane, in the lane order** — Recharts draws one rectangle per row in row order, while the payload is walked lane by lane. The adapter checks this and turns highlighting off for the layer when the rows interleave lanes, rather than highlighting somebody else's task.

### Gauge Chart

One measure read against a range. The data holds a single row; everything else the reading needs is author knowledge and arrives through `gaugeConfig`, which is therefore required:

```tsx
const data = [{ measure: 'NPS', score: 73 }];

<MaidrRecharts
  id="gauge-example"
  title="Net Promoter Score"
  data={data}
  chartType="gauge"
  xKey="measure"
  yKeys={['score']}
  gaugeConfig={{
    min: 0,
    max: 100,
    target: 80,
    bands: [{ to: 40, label: 'poor' }, { to: 70, label: 'ok' }, { to: 100, label: 'good' }],
  }}
>
  <RadialBarChart
    width={400} height={250}
    innerRadius={80} outerRadius={140}
    startAngle={180} endAngle={0}
    data={data}
  >
    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
    <RadialBar dataKey="score" fill="#8884d8" background />
  </RadialBarChart>
</MaidrRecharts>
```

"73" is not the reading. "73 out of 100, 7 below target, in the 'ok' band" is, and a sighted reader gets all of it from the dial's geometry — the needle's position, the marker beside it, the coloured arc it lands on. None of that is written anywhere a screen reader can reach, and none of it is inferable from a `<RadialBar>`, so the range mirrors the chart's `domain` and the target and bands are declared.

Bands are **ascending and bounded above only**: a band starts where the previous one ended, and the first starts at `min`. A value above every band belongs to none rather than to the last one. There is deliberately no default range — a guessed maximum misreports the one number the chart draws.

### Treemap, Sunburst and Icicle

All three draw the same hierarchy, and all three take the **nested** `{ name, children }` data Recharts itself is given rather than the adapter's usual flat rows. `xKey` is the `<Treemap nameKey>` and the single `yKeys` entry its `dataKey`:

```tsx
const nodes = [
  { name: 'Europe', children: [{ name: 'France', people: 67.4 }, { name: 'Spain', people: 47.4 }] },
  { name: 'Asia', children: [{ name: 'Japan', people: 125.1 }, { name: 'Nepal', people: 30.0 }] },
];

<MaidrRecharts
  id="treemap-example"
  title="Population by Region"
  data={nodes}
  chartType="treemap"
  xKey="name"
  yKeys={['people']}
>
  <Treemap width={600} height={350} data={nodes} dataKey="people" nameKey="name" />
</MaidrRecharts>
```

A sunburst is the same config with `chartType="sunburst"`. Its Recharts component takes a single root object, and it draws that root's **children** — so pass the children here, and the declared nodes are then exactly the drawn ones:

```tsx
<MaidrRecharts id="sunburst-example" data={nodes} chartType="sunburst" xKey="name" yKeys={['people']}>
  <SunburstChart width={400} height={400} data={{ name: 'World', children: nodes }} dataKey="people" />
</MaidrRecharts>
```

MAIDR navigates the tree **as a tree**, on arrow keys that already exist: up returns to the parent, down enters the first child, left and right walk the siblings. Each node is announced with its exact share of its parent — the comparison the rectangles are drawn to support and the one the eye estimates worst.

A node with children gets no value of its own, because Recharts computes an interior node's value as the sum of its children and ignores any value declared on it. MAIDR derives interior totals the same way.

Highlighting relies on both components drawing their nodes in depth-first pre-order, which they do. The treemap selector deliberately skips the **synthetic root** rectangle Recharts wraps the data array in — it is one element more than there are nodes, and a count mismatch turns highlighting off entirely. A `<Treemap type="nest">`, or one given a custom `content`, draws something else and needs `selectorOverride`.

An icicle takes the same config again, with `chartType="icicle"`. Recharts has no icicle component, so the bands are drawn the way a gantt's intervals are: a `<BarChart layout="vertical">` whose lane is the node's **depth** and whose `<Bar>` returns the band's `[start, end]` span. One rectangle per row, and the rows must be the tree flattened **depth-first pre-order** — the order the adapter emits its nodes in, so that row *i* is node *i*:

```tsx
// The same `nodes` tree, flattened the way the adapter flattens it.
const bands = [
  { name: 'Europe', depth: '0', from: 0, to: 240 },
  { name: 'France', depth: '1', from: 0, to: 67.4 },
  { name: 'Spain', depth: '1', from: 67.4, to: 114.8 },
  { name: 'Asia', depth: '0', from: 240, to: 395 },
  { name: 'Japan', depth: '1', from: 240, to: 365.1 },
  { name: 'Nepal', depth: '1', from: 365.1, to: 395.1 },
];

<MaidrRecharts id="icicle-example" data={nodes} chartType="icicle" xKey="name" yKeys={['people']}>
  <BarChart width={600} height={300} layout="vertical" data={bands}>
    <XAxis type="number" />
    <YAxis type="category" dataKey="depth" />
    <Bar dataKey={row => [row.from, row.to]} fill="#8884d8" />
  </BarChart>
</MaidrRecharts>
```

Built the other obvious way — one stacked `<Bar>` per depth level — the rectangles come out series-major rather than depth-first, which is not the order the nodes are in. Such a chart needs `selectorOverride`.

### Parallel Coordinates

An observation per row, an axis per variable. Recharts has no parallel coordinates chart and cannot quite have one: a `<Line>` binds to a single `yAxisId`, so a polyline crossing axes measured in different units has to be drawn from values **min-max normalised** onto one shared scale, over rows keyed by axis with one `<Line>` per observation.

MAIDR must not see those normalised numbers. It derives each column's own extent and pitches a value against its **own** axis — that is the whole chart — so handed 0-to-1 values every axis would run the same range and the crossings the plot is drawn to show would be gone. So `data` here is the **observations, with their raw values**, and `parallelConfig.dimensions` names the raw fields in the order the axes are drawn:

```tsx
const cars = [
  { car: 'Mazda RX4', mpg: 21, hp: 110, wt: 2.62 },
  { car: 'Datsun 710', mpg: 22.8, hp: 93, wt: 2.32 },
  { car: 'Hornet 4 Drive', mpg: 21.4, hp: 110, wt: 3.215 },
  { car: 'Valiant', mpg: 18.1, hp: 105, wt: 3.46 },
];

// What the chart is drawn from: the transpose, normalised per axis.
const axisRows = [
  { axis: 'Miles per gallon', obs0: 0.62, obs1: 1, obs2: 0.7, obs3: 0 },
  { axis: 'Horsepower', obs0: 0.2, obs1: 0, obs2: 0.2, obs3: 0.14 },
  { axis: 'Weight (1000 lb)', obs0: 0.26, obs1: 0, obs2: 0.79, obs3: 1 },
];

<MaidrRecharts
  id="parallel-example"
  title="Cars by Specification"
  data={cars}
  chartType="parallel"
  xKey="car"
  parallelConfig={{
    dimensions: ['mpg', 'hp', { label: 'Weight (1000 lb)', key: 'wt' }],
    labelKey: 'car',
  }}
  xLabel="Variable"
  yLabel="Value"
>
  <LineChart width={600} height={350} data={axisRows}>
    <XAxis dataKey="axis" />
    <YAxis domain={[0, 1]} />
    {cars.map((car, i) => (
      <Line key={car.car} dataKey={`obs${i}`} name={car.car} dot={false} />
    ))}
  </LineChart>
</MaidrRecharts>
```

A bare `dimensions` string names both the axis and the field; the object form separates them, for a column whose key is not what a reader should hear. The order is the order a reader arrows through the axes, and nothing on an observation states it — an object's key order is not an axis order.

`labelKey` names the observation, which becomes the polyline's series name. Without it an observation is announced by its position among the rest.

Highlighting resolves one `<Line>` path per observation and marks each vertex on it. It is withheld in one case: a chart with exactly as many observations as axes, where MAIDR's element-based resolution cannot tell the two counts apart and would light the wrong polyline.

### Ridgeline (Joy) Plot

One density curve per group along a shared value axis, the curves offset down the page so their shapes can be compared. There is no primitive for it: the chart is overlapping `<Area>`s with a per-group offset **baked into the plotted values**.

The offset is presentation — it exists so the curves do not overlap illegibly, and says nothing about any group — so `densityKey` must name the density **before** it was added. Fed the drawn y instead, every group's loudness becomes a function of where it was stacked, and the lowest ridge is the loudest thing on the chart. Where nothing resolves as a density the adapter refuses the reading rather than subtracting a guessed baseline.

The kernel density itself is computed outside both Recharts and the adapter; `data` is the sampled curves, one row per sample:

```tsx
const samples = [
  { month: 'Jan', temp: -4, density: 0.06, plotted: 2.06 },
  { month: 'Jan', temp: 0, density: 0.11, plotted: 2.11 },
  { month: 'Feb', temp: -2, density: 0.08, plotted: 1.08 },
  { month: 'Feb', temp: 2, density: 0.13, plotted: 1.13 },
];

<MaidrRecharts
  id="ridgeline-example"
  title="Daily Temperature by Month"
  data={samples}
  chartType="ridgeline"
  xKey="temp"
  ridgelineConfig={{ groupKey: 'month', valueKey: 'temp', densityKey: 'density' }}
  xLabel="Temperature (C)"
  yLabel="Month"
>
  <AreaChart width={600} height={350}>
    <XAxis dataKey="temp" type="number" />
    <YAxis type="number" />
    {['Jan', 'Feb'].map(month => (
      <Area
        key={month}
        data={samples.filter(s => s.month === month)}
        dataKey="plotted"
        name={month}
      />
    ))}
  </AreaChart>
</MaidrRecharts>
```

Groups are announced in the order they first appear in `data`. Highlighting lights one whole ridge — a chart draws a filled band per group, not an element per sample — so the `<Area>`s have to be declared in that same order; otherwise pass `selectorOverride`.

Arrowing up and down moves between groups **holding the value**, which is the comparison a ridgeline exists for and the one a listener cannot make by holding a dozen numbers in their head.

### Hexbin

The standard answer to an overplotted scatter: bin the points into hexagons and encode the count. Recharts places the marks and nothing else — `<Scatter>` accepts a custom `shape`, which is documented API — so the binning happens before the chart is drawn and `data` is one row per **occupied** bin, its centre in **data units**:

```tsx
const bins = [
  { carat: 0.35, price: 800, count: 41 },
  { carat: 0.55, price: 800, count: 96 },
  { carat: 0.45, price: 1600, count: 27 },
  { carat: 0.65, price: 1600, count: 88 },
];

<MaidrRecharts
  id="hexbin-example"
  title="Carat against Price"
  data={bins}
  chartType="hexbin"
  xKey="carat"
  yKeys={['price']}
  hexbinConfig={{ countKey: 'count' }}
  xLabel="Carat"
  yLabel="Price ($)"
>
  <ScatterChart width={600} height={350}>
    <XAxis dataKey="carat" type="number" />
    <YAxis dataKey="price" type="number" />
    <Scatter data={bins} shape={Hexagon} />
  </ScatterChart>
</MaidrRecharts>
```

The adapter assembles the **lattice** those bins form: rows grouped by their y centre (or by `rowKey`), ordered from the lowest upward, each row ordered left to right. MAIDR needs that shape because a hex lattice staggers alternate rows — a column index is not a position, so a vertical move keeps the bin whose centre is nearest the x the reader started from, and every bin is announced by its centre rather than by an index.

Screen coordinates must not be passed through: a bin computed with `d3-hexbin` carries its centre in pixels, so invert the scales before handing the rows over. A `count` left undeclared is read from a `count`, `length`, `value`, `n` or `total` column — the `length` fallback being what makes a `d3-hexbin` bin, which *is* the array of points that fell in it, work untouched.

Highlighting is emitted only when the rows already arrive in lattice order, since a `<Scatter>` draws its symbols in row order and any other order would light a bin half a field away.

### Boxen (Letter-Value) Plot

A box plot's five-number summary generalised to a variable-depth ladder: a large sample gets *more* rungs, so its tails stay legible instead of collapsing into a whisker and a scatter of dots. Recharts has no box primitive at all, so the rungs are drawn as stacked `<Bar>`s over a transparent base — and neither the ladder nor the median is anything that construction holds. Both are computed from the raw sample and arrive through `data`, one row per distribution:

```tsx
const distributions = [
  {
    region: 'East',
    median: 180,
    levels: [
      { p: 0.25, lo: 150, hi: 240 },
      { p: 0.125, lo: 130, hi: 310 },
      { p: 0.0625, lo: 110, hi: 420 },
    ],
    slow: [820, 910],
  },
  { region: 'West', median: 210, levels: [{ p: 0.25, lo: 175, hi: 260 }] },
];

<MaidrRecharts
  id="boxen-example"
  title="Response Time by Region"
  data={distributions}
  chartType="boxen"
  xKey="region"
  boxenConfig={{ upperOutliersKey: 'slow' }}
  selectorOverride="#maidr-article-boxen-example .boxen-centre .recharts-rectangle"
  xLabel="Region"
  yLabel="Response time (ms)"
>
  <BarChart width={600} height={350} data={drawn}>
    <XAxis dataKey="region" />
    <YAxis />
    <Bar dataKey="base" stackId="ladder" fill="transparent" />
    <Bar dataKey="seg0" stackId="ladder" fill="#dcdcf0" />
    {/* ... one <Bar> per gap between consecutive ladder positions ... */}
  </BarChart>
</MaidrRecharts>
```

`p` is the **tail** probability, which is how letter-value plots are defined and how the libraries that draw them report it: `p = 0.25` is the rung spanning the middle half, `p = 0.125` the middle three quarters, and so on inwards. MAIDR announces each position as the percentile it actually is, and walks the ladder in value order — deepest lower quantile, inward to the median, outward again — so arrowing across rises monotonically through the distribution and the *rate* it rises at is where the sample is thin. The order the rungs arrive in does not matter.

A rung whose three numbers are not all finite is dropped rather than announced as a quantile the data never contained, and a row with no median is dropped entirely: the median is the ladder's centre and a navigable position in its own right.

No highlight selector is generated. A rung is a rectangle and a distribution is not, and no class name says which rung is which — so a chart that wants highlighting puts a `className` on the single `<Bar>` that can stand for the whole distribution and passes it as `selectorOverride`, as above.

### Composed Chart (Bar + Line)

Use `layers` mode to mix different chart types in a single chart:

```tsx
const data = [
  { month: 'Jan', revenue: 4200, trend: 4000 },
  { month: 'Feb', revenue: 5800, trend: 4800 },
  { month: 'Mar', revenue: 3900, trend: 5200 },
  { month: 'Apr', revenue: 7100, trend: 5800 },
];

<MaidrRecharts
  id="composed-example"
  title="Revenue and Trend"
  data={data}
  xKey="month"
  layers={[
    { yKey: 'revenue', chartType: 'bar', name: 'Revenue' },
    { yKey: 'trend', chartType: 'line', name: 'Trend' },
  ]}
  xLabel="Month"
  yLabel="Amount ($)"
>
  <ComposedChart width={600} height={350} data={data}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="month" />
    <YAxis />
    <Tooltip />
    <Legend />
    <Bar dataKey="revenue" fill="#8884d8" name="Revenue" />
    <Line type="monotone" dataKey="trend" stroke="#ff7300" name="Trend" dot />
  </ComposedChart>
</MaidrRecharts>
```

## Multi-Panel (Faceted) Charts

Recharts has no native facet concept — multi-panel layouts are several sibling chart components. The adapter's **subplot mode** turns such a grid into ONE accessible MAIDR figure: arrow keys move between panels, ENTER drills into a panel, ESCAPE returns to panel navigation, and PageUp/PageDown steps through a panel's layers.

Describe the grid with the `subplots` prop and pass **one Recharts chart per panel as children, in row-major order** (first child = top-left panel `[0][0]`, then across the row, then the next row). `<MaidrRecharts>` wraps each child in a generated `.maidr-panel-<row>-<col>` div and lays each grid row out as a flex row, so highlighting and announcements stay scoped to the correct panel — a mismatched children order narrates one panel while highlighting another.

Top-level props (`data`, `xKey`, `yKeys`, `xLabel`, `yLabel`, `orientation`, `fillKeys`, `binConfig`) act as defaults that each panel may override. Every panel must define its own `chartType` + `yKeys` (or `layers` for a composed panel), and `subplots` is mutually exclusive with the top-level `chartType`/`layers`. A panel's `title` is its announced display name (e.g. the facet value).

```tsx
const east = [{ quarter: 'Q1', revenue: 4200 }, { quarter: 'Q2', revenue: 5800 }];
const west = [{ quarter: 'Q1', revenue: 3100 }, { quarter: 'Q2', revenue: 4400 }];

<MaidrRecharts
  id="sales-by-region"
  title="Quarterly Revenue by Region"
  xKey="quarter"
  yKeys={['revenue']}
  xLabel="Quarter"
  yLabel="Revenue ($)"
  subplots={[[
    { title: 'East', chartType: 'bar', data: east },
    { title: 'West', chartType: 'bar', data: west },
  ]]}
>
  {/* One chart per panel, in row-major grid order */}
  <BarChart width={320} height={220} data={east}>
    <XAxis dataKey="quarter" />
    <YAxis />
    <Bar dataKey="revenue" fill="#8884d8" />
  </BarChart>
  <BarChart width={320} height={220} data={west}>
    <XAxis dataKey="quarter" />
    <YAxis />
    <Bar dataKey="revenue" fill="#82ca9d" />
  </BarChart>
</MaidrRecharts>
```

### Grid Shapes

- **2D array** — `subplots={[[a, b], [c, d]]}` is a 2x2 grid in visual reading order. Ragged rows (`[[a, b], [c]]`) are allowed; empty rows are not.
- **Flat array + `columns`** — `subplots={[a, b, c]} columns={2}` chunks into `[[a, b], [c]]`. Without `columns`, a flat array becomes a single row.

### Custom Panel DOM (`panelSelector`)

If you render the panel containers yourself — for example with the `useRechartsAdapter` hook and `<Maidr>` directly, where no wrapper divs are generated — give each panel config a `panelSelector` that uniquely matches that panel's own container:

```tsx
subplots={[[
  { title: 'East', chartType: 'bar', data: east, panelSelector: '.east-panel' },
  { title: 'West', chartType: 'bar', data: west, panelSelector: '.west-panel' },
]]}
```

The selector is used to scope that panel's highlight selectors, so it must match **only** that panel.

### Notes and Limitations

- The visual grid must match the `subplots` config shape. `<MaidrRecharts>` guarantees this by generating the layout; with `panelSelector` it is your responsibility.
- Per-panel `selectorOverride` is applied verbatim (it is NOT combined with the panel scope and does not inherit the top-level `selectorOverride`) — provide an already panel-scoped selector.
- The multi-series highlighting limitation applies per panel: a panel with multiple `yKeys` gets audio/text/braille but no visual highlighting unless it has a `selectorOverride`.
- For grids with more than one row, MAIDR measures each panel's on-screen position (via the per-panel container the adapter emits as the subplot `selector`) to determine the visual row order, so the Up/Down arrows match the visual layout. If that geometry cannot be measured — e.g. a `panelSelector` that matches nothing, or panels rendered without layout boxes — MAIDR falls back to data-array order and the Up/Down arrows are deterministically reversed (Up moves to the visually lower row). Single-row grids are unaffected either way.

## TypeScript Types

All types are exported from `maidr/recharts`:

```tsx
import {
  MaidrRecharts,              // The wrapper component
  type MaidrRechartsProps,     // Props for MaidrRecharts
  type RechartsAdapterConfig,  // Adapter configuration
  type RechartsChartType,      // Supported chart types
  type RechartsLayerConfig,    // Layer config for composed mode
  type RechartsSubplotConfig,  // Panel config for subplot mode
  type HistogramBinConfig,     // Histogram bin configuration
  type FlowLinkConfig,         // Alluvial link/node configuration
  type VolcanoPointConfig,     // Volcano and Manhattan labels and cutoffs
  type ErrorIntervalConfig,    // Error bar / forest interval configuration
  type ForestPlotConfig,       // Forest plot weights, pooled row and null line
  type SurvivalCurveConfig,    // Survival censoring and confidence band keys
} from 'maidr/recharts';
```

### `RechartsChartType`

```typescript
type RechartsChartType =
  | 'bar'
  | 'stacked_bar'
  | 'dodged_bar'
  | 'normalized_bar'
  | 'diverging_bar'
  | 'waterfall'
  | 'dumbbell'
  | 'gantt'
  | 'gauge'
  | 'dot'
  | 'lollipop'
  | 'funnel'
  | 'histogram'
  | 'line'
  | 'area'
  | 'stacked_area'
  | 'normalized_area'
  | 'radar'
  | 'polar_area'
  | 'bump'
  | 'survival'
  | 'scatter'
  | 'volcano'
  | 'manhattan'
  | 'error_bar'
  | 'forest'
  | 'pie'
  | 'alluvial'
  | 'sankey'
  | 'treemap'
  | 'sunburst'
  | 'icicle'
  | 'parallel'
  | 'ridgeline'
  | 'hexbin'
  | 'boxen';
```

### `RechartsLayerConfig`

```typescript
interface RechartsLayerConfig {
  yKey: string;              // Key in data for this series' y-values
  chartType: RechartsChartType; // Chart type for this series
  name?: string;             // Display name (used in legends/descriptions)
}
```

### `RechartsSubplotConfig`

```typescript
interface RechartsSubplotConfig {
  title?: string;               // Panel display name (e.g. the facet value)
  chartType?: RechartsChartType; // Panel chart type (simple mode)
  yKeys?: string[];             // Panel series keys (simple mode)
  layers?: RechartsLayerConfig[]; // Composed-mode layers for this panel
  data?: Record<string, unknown>[]; // Panel data (defaults to top-level data)
  xKey?: string;                // Defaults to top-level xKey
  xLabel?: string;              // Defaults to top-level xLabel
  yLabel?: string;              // Defaults to top-level yLabel
  orientation?: Orientation;    // Defaults to top-level orientation
  fillKeys?: string[];          // Defaults to top-level fillKeys
  binConfig?: HistogramBinConfig; // Defaults to top-level binConfig
  selectorOverride?: string;    // Panel-scoped highlight selector override
  panelSelector?: string;       // Custom panel container selector (escape hatch)
}
```

### `HistogramBinConfig`

```typescript
interface HistogramBinConfig {
  xMinKey: string;   // Key for lower bin edge
  xMaxKey: string;   // Key for upper bin edge
  yMinKey?: string;  // Key for minimum count (defaults to 0)
  yMaxKey?: string;  // Key for maximum count (defaults to yKey value)
}
```

### `FlowLinkConfig`

```typescript
interface FlowLinkConfig {
  targetKey: string;                 // Key for the node the flow arrives at
  nodes?: Record<string, unknown>[]; // The `nodes` half of the <Sankey> data
  nodeNameKey?: string;              // Key for a node's name (defaults to 'name')
}
```

### `VolcanoPointConfig`

```typescript
interface VolcanoPointConfig {
  labelKey?: string;      // Key for what the point is (gene, SNP, probe)
  groupKey?: string;      // Key for the region it belongs to (chromosome)
  significance?: number;  // Cutoff on the y axis — no default
  significanceDirection?: 'above' | 'below'; // Which side is significant (default 'above')
  effect?: number;        // Cutoff on |x|
}
```

### `ErrorIntervalConfig`

```typescript
interface ErrorIntervalConfig {
  errorKey?: string;  // Key the <ErrorBar dataKey> points at — an OFFSET
  yMinKey?: string;   // Key for the absolute lower bound (wins over errorKey)
  yMaxKey?: string;   // Key for the absolute upper bound (wins over errorKey)
}
```

### `ForestPlotConfig`

```typescript
interface ForestPlotConfig {
  weightKey?: string;   // Key for the study's weight, as a fraction of one
  pooledKey?: string;   // Key whose truthy value marks the pooled summary row
  pooledIndex?: number; // Index of the pooled row, for data with no flag column
  nullValue?: number;   // The value that means "no effect" — no default
}
```

### `SurvivalCurveConfig`

```typescript
interface SurvivalCurveConfig {
  censoredKeys?: string[];  // Keys marking censored times, 1:1 with yKeys
  yMinKeys?: string[];      // Keys for the lower confidence band, 1:1 with yKeys
  yMaxKeys?: string[];      // Keys for the upper confidence band, 1:1 with yKeys
  stepDirection?: StepDirection; // Where the curve jumps (defaults to 'hv')
}
```

### `WaterfallStepConfig`

```typescript
interface WaterfallStepConfig {
  totalKey?: string;      // Key whose truthy value marks a row as restating the total
  totalIndices?: number[]; // Indices of the restating rows, for data with no flag column
  kindKey?: string;       // Key holding 'increase' | 'decrease' | 'total' outright
}
```

### `GanttChartConfig`

```typescript
interface GanttChartConfig {
  lanes?: (string | number)[]; // The lanes in draw order — declare them to keep empty ones
  labelKey?: string;           // Key naming an individual interval within its lane
  unit?: string;               // What a unit of the axis is called ('days', 'hours')
}
```

### `GaugeDialConfig`

```typescript
interface GaugeDialConfig {
  min: number;         // Lower end of the dial — no default
  max: number;         // Upper end of the dial — no default
  target?: number;     // The target marker a bullet chart draws
  bands?: GaugeBand[]; // Qualitative bands, ascending, upper edges only
  label?: string;      // What the measure is called (defaults to the xKey value)
}
```

### `ParallelAxesConfig`

```typescript
interface ParallelAxesConfig {
  // The axes in draw order, naming the RAW fields — not the normalised ones
  // the chart plots. A bare string is both the axis name and the field.
  dimensions: (string | { label?: string; key: string })[];
  labelKey?: string; // Key naming the observation (defaults to label/snp/id/name/gene/probe)
}
```

### `RidgelineCurveConfig`

```typescript
interface RidgelineCurveConfig {
  groupKey: string;    // Key holding the group a sample's curve belongs to
  valueKey?: string;   // Position on the value axis (defaults to value/x/t/position)
  densityKey?: string; // Density BEFORE the ridge offset (defaults to density/kde/width/p/estimate)
}
```

### `HexbinLatticeConfig`

```typescript
interface HexbinLatticeConfig {
  xKey?: string;     // Bin centre x, in DATA units (defaults to the chart's xKey)
  yKey?: string;     // Bin centre y, in DATA units (defaults to the first yKeys entry)
  countKey?: string; // Points in the bin (defaults to count/length/value/n/total)
  rowKey?: string;   // Lattice row (defaults to grouping by identical y)
}
```

### `BoxenLadderConfig`

```typescript
interface BoxenLadderConfig {
  xKey?: string;             // The category (defaults to the chart's xKey)
  medianKey?: string;        // Defaults to median/q2/mid/y
  levelsKey?: string;        // The { p, lo, hi } ladder (defaults to levels/letterValues/letter_values/quantiles/ladder)
  lowerOutliersKey?: string; // Values below the deepest rung
  upperOutliersKey?: string; // Values above the deepest rung
}
```

## Advanced

### How It Works

`<MaidrRecharts>` is a convenience wrapper that:

1. Takes your Recharts-style data and configuration props
2. Converts them into MAIDR's internal data format via `convertRechartsToMaidr()`
3. Wraps your Recharts children with the `<Maidr>` component

This means you use Recharts' familiar flat data format (`[{ name: 'Q1', value: 100 }, ...]`) instead of building MAIDR's typed structures manually.

### Recharts vs React (Low-Level)

| Feature | Recharts Adapter | React (Low-Level) |
|---------|-----------------|-------------------|
| Import | `import { MaidrRecharts } from 'maidr/recharts'` | `import { Maidr } from 'maidr/react'` |
| Data format | Recharts flat array | MAIDR typed structures |
| Configuration | Props on `<MaidrRecharts>` | Manual `MaidrData` JSON |
| Chart types | 7 supported types | All MAIDR trace types |
| SVG highlighting | Automatic | Manual `selectors` setup |
| Best for | Recharts projects | Custom SVG / other libraries |

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
