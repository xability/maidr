# Apache ECharts

MAIDR reads a rendered [Apache ECharts](https://echarts.apache.org/) chart and
makes it navigable with audio sonification, text descriptions, braille output
and keyboard navigation.

Measured against **echarts 6.1.0**.

## Quick start

```html
<script src="https://cdn.jsdelivr.net/npm/echarts@6/dist/echarts.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/echarts.js"></script>
<div id="chart" style="width: 600px; height: 400px"></div>
<script>
  const container = document.querySelector('#chart');
  const chart = echarts.init(container, null, { renderer: 'svg' });

  chart.setOption({
    title: { text: 'Daily Visitors' },
    xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'], name: 'Day' },
    yAxis: { name: 'Visitors' },
    series: [{ type: 'bar', name: 'Visitors', data: [120, 240, 180] }],
  });

  chart.on('finished', function once() {
    chart.off('finished', once);
    const maidr = maidrECharts.createMaidrFromEChart(chart, container);
    container.setAttribute('maidr', JSON.stringify(maidr));
  });
</script>
```

Two things this example does on purpose:

- **`renderer: 'svg'`.** ECharts defaults to canvas, which draws no elements to
  point at. A canvas chart still reads — audio, text and braille all come from
  the chart's model — and its bars, points, lines, areas, pie slices and
  sunburst slices are outlined through an overlay drawn from the model (see
  [On a canvas](#on-a-canvas)). Every other series type is outlined only when
  it is drawn as SVG.
- **Calling after `finished`.** The adapter locates marks in the drawn chart,
  so it has to run after ECharts has drawn.

### Keeping a chart bound

`createMaidrFromEChart` reads a chart once. A chart whose data changes, or that
is resized, needs reading again. `bindEChart` does that, and takes the place of
the `finished` handler above:

```js
const chart = echarts.init(container, null, { renderer: 'svg' });
chart.setOption(option);
const unbind = maidrECharts.bindEChart(chart);

// Before the chart is disposed:
unbind();
chart.dispose();
```

It reads the chart again after any render that changed the chart's option or
its size — a new `setOption`, a filter, a resize. A render that changed neither
is not read again. That matters because ECharts fires `finished` after every
render, including the ones a mouse moving across the chart causes, and a
reading taken again sends the reader back to the start of the chart.

MAIDR is mounted on the element ECharts draws into, inside the container
passed to `echarts.init`. That container is often a React component's own
`<div>`, and MAIDR moves the element it mounts on into a wrapper.

`bindAllECharts(echarts)` binds every chart on the page, including those drawn
later. It unbinds any chart that is disposed or removed. It needs **the page's
own** `echarts` module: `echarts.getInstanceByDom` looks a chart up in a
registry private to the copy of ECharts that created it, so a second copy
loaded beside it finds nothing.

## Apache Superset and Metabase

[Apache Superset](https://superset.apache.org/) and
[Metabase](https://www.metabase.com/) draw most of their charts with ECharts
([#1304](https://github.com/xability/maidr/issues/1304)). Both were run and
their charts captured from the browser. The captures are the fixtures under
`e2e_tests/fixtures/bi-tools/`, and `e2e_tests/specs/biToolOutput.spec.ts`
drives each one with the keyboard.

| | Metabase 0.63.18.2 | Superset 6.1.0 |
|---|---|---|
| renderer | SVG | canvas; the only renderer it registers |
| data | a `dataset`, read by each series through `encode` | inline `[x, y]` pairs |
| series names | none; each series has an `id` such as `43:CNT:Widget` | the metric or the group |
| time series | a `time` x axis | a `time` x axis, or a `time` y axis for a horizontal bar |
| "pie" | a one-level `sunburst` | `pie` |
| instance | only through `echarts/core`, bundled | only through `echarts/core`, bundled |

What the adapter does for them:

- **A series fed from a `dataset` is read through `encode`.** Its data list
  holds every column of the dataset, so the adapter asks
  `data.mapDimension('y')` which column a coordinate reads, not "the second
  column". Before this, a Metabase bar was announced with the first metric's
  values whatever it was drawn from, and an encoded pie produced no layer.
- **A time axis is announced as dates.** `2024-01-01` rather than
  `1704067200000`. A scatter point keeps its numeric `x` and carries the date
  as its `xLabel`.
- **A bar with its time on the y axis is horizontal.** This is how Superset
  turns a time-series bar on its side.
- **A series with no name is named by its `id`.** Without this, the Metabase
  segments of one stacked bar were all announced as "Series 1", "Series 2", …
  An id ECharts invented for itself begins with a NUL character and is never
  used.
- **White is recognised in any spelling.** Metabase paints its hollow line
  symbols `hsla(0, 0%, 100%, 1.00)`, which was counted as a mark and cost a
  Metabase area its outline.
- **A canvas is outlined through an overlay.** See
  [On a canvas](#on-a-canvas).

### Mounting MAIDR on them

Neither tool exposes its ECharts instances. Both import `echarts/core` into
their own bundle, and nothing on a chart's element refers back to the
instance: ECharts writes only an id, `_echarts_instance_="ec_…"`, which
resolves through the private registry of the copy that wrote it. So MAIDR has
to be mounted **from inside the tool's own frontend**, where that copy is
importable:

```js
import 'maidr';
import * as echarts from 'echarts/core';
import { bindAllECharts } from 'maidr/echarts';

bindAllECharts(echarts);
```

- **Superset** — run this once from the frontend's setup, alongside the plugin
  registration in `superset-frontend/src/setup/setupPlugins.ts`. It binds every
  chart on explore pages and dashboards alike. Each dashboard tile has its own
  `[_echarts_instance_]` element.
- **Metabase** — the same, or per chart in `EChartsRenderer`: call
  `bindEChart(chart)` from its `onInit`, and the function it returns from
  `useUnmount` before `chart.dispose()`.

Three other routes were weighed and not taken:

- **A browser extension or userscript** would reach any ECharts page, but it
  runs outside the bundle, so it cannot call the bundle's
  `getInstanceByDom`. It would have to intercept instances as ECharts
  constructs them, before the page's own scripts run. That is how the fixtures
  were captured (see their README), but it depends on ECharts' private field
  names, so MAIDR does not ship it.
- **A Superset chart plugin** makes a new chart type accessible, not the
  existing ones. Every chart already in use would have to be rebuilt as the
  plugin's type.
- **Metabase's embedding SDK** renders the same components inside the
  embedder's page. Whether the embedder can import the SDK's copy of ECharts
  depends on how the SDK is packaged, which was not measured. If it can,
  `bindAllECharts` works there as it does anywhere else.

Not covered:

- **Metabase's row chart** is drawn with visx, not ECharts.
- **Helper series** — Metabase's data-label totals, trend lines and goal line,
  and Superset's annotation and forecast layers — are not in the fixtures.
  Each appears only when a chart setting turns it on.
- **A Metabase series is named by its id** (`43:CNT:Widget`), which carries its
  metric and its breakout value. The label its legend shows is only in the
  tool's own HTML.
- **Superset leaves axis titles empty by default**, so a reading says
  "X is … , Y is …" unless the chart's author names the axes.

## Supported series types

| ECharts `series.type` | Read as | Notes |
|---|---|---|
| `bar` | `bar` | One series. `yAxis: {type: 'category'}` makes it horizontal |
| `bar` ×N sharing a `stack` | `stacked_bar` | Each point carries its series name |
| `bar` ×N without a `stack` | `dodged_bar` | |
| `line` | `line` | |
| `line` + `areaStyle` | `area` [experimental] | The fill is what makes it an area |
| `line` + `step` | `line` + `stepDirection` | `'start'` → `vh`, `'end'`/`'middle'` → `hv` |
| `scatter` | `point` | A `symbolSize` reading a third column becomes `ScatterPoint.z`, which is audible |
| `pictorialBar` | `bar` | A bar drawn with a symbol instead of a rectangle; read as the bar it is |

**Every series type the adapter has measured now has a reading.** A type
outside that set is still refused *by name* rather than mapped onto whichever
trace is closest — an ECharts extension such as `wordCloud` registers its own,
and core gains types between releases. See
[#1195](https://github.com/xability/maidr/issues/1195) for the tiers.

> **Orientation note:** ECharts has no "horizontal" option. A bar chart is
> turned on its side by making the **y** axis the categorical one, and that is
> the only thing that says so — so the adapter reads the orientation from which
> axis is `type: 'category'`, and moves the magnitude onto the axis that
> carries it.

> **Gap note:** a datum with no value draws nothing. In a bar chart that
> category is left out of the reading entirely, because there is no bar to
> announce or outline; in a line chart it is kept, with no reading, so the
> samples either side stay in their places rather than the series closing over
> the hole.

## Single-value charts

A pie, a funnel and a gauge sit on no grid and own the whole chart, and all
three report `data.dimensions` as `['value']` with the label on `getName(i)` —
so the reading is that pair.

| ECharts | read as | highlighted |
|---|---|---|
| `pie` | `pie` | yes — one selector naming every slice |
| `funnel` [experimental] | `funnel` | yes — one selector per stage. `orient` is read; see below |
| `gauge` [experimental] | `gauge` | **no** — see below |

**A funnel's `orient` and MAIDR's `orientation` name opposite directions, on
purpose.** ECharts names the direction its stages progress; MAIDR names the
direction the magnitude runs — the convention by which a chart with its bars
running left to right is a *horizontal* bar chart. Measured in Chromium for
values 100/60/20, `orient: 'vertical'` (the default) draws uniform band heights
of 80 against widths of 360/216/72, so the value is a horizontal extent and the
layer is read with the count in `x` and the stage in `y`. `orient: 'horizontal'`
is the transpose — uniform widths of 120 against heights of 240/144/48 — and is
the one MAIDR calls upright.

A gauge draws **two** filled marks for its one datum: the track and the
progress arc, measured as `#e8ebf0` and the series colour. The count check
every other reading here relies on has nothing to check, and naming either
mark would be a guess about which one the reader should be shown, so the
gauge is read without an outline.

`min` and `max` come off the series rather than being defaulted here.
`getModel()` resolves ECharts' own `0` and `100` when the author wrote
neither, so the dial the reader is told about is the dial that was drawn.

## Grid-value charts

A heat grid and a price chart sit on the same cartesian axes the bar family
uses, and differ from it in the same way: a datum is not one magnitude but a
set of them, and ECharts has already worked them out. Measured on 6.1.0 the
model reports them under named dimensions, so nothing is recovered from the
drawing:

| ECharts | `data.dimensions` | read as | highlighted |
|---|---|---|---|
| `heatmap` | `['x', 'y', 'value']` | `heat` | yes — a selector per cell |
| `candlestick` | `['base', 'open', 'close', 'lowest', 'highest']` | `candlestick` | yes — a selector per candle |
| `boxplot` | `['base', 'min', 'Q1', 'median', 'Q3', 'max']` | `box` | **no** — see below |

A box plot follows the same `yAxis: {type: 'category'}` the bar family does:
with the categories on the y axis it is announced as a horizontal box plot and
read against the axes as drawn. The five numbers do not move with it — there is
no pair to exchange — but the group is then announced against the y axis title,
and the arrow keys walk the sections of one distribution rather than walking
across the distributions.

Both draw exactly one filled mark per datum — a cell, a candle body with its
wick — which is the same shape the bar reading already counts and stamps.

**A heatmap numbers a cell by axis index, not by name,** and a category y axis
runs bottom-up: a 2×2 grid reports its cells as `[0,0]`, `[0,1]`, `[1,0]`,
`[1,1]` with `y = 0` along the bottom. `HeatmapData` is top-first, so the rows
are turned over on the way out — and the selector grid is built by the same
walk that places the values, so a cell's outline and its reading cannot
disagree.

**A cell the chart drew nothing at stays empty rather than becoming a zero.** A
grid is a rectangle and the data need not fill it, so a missing cell reads as
missing ([#1191](https://github.com/xability/maidr/issues/1191)) and carries no
selector.

**A candlestick's `volatility` is the day's range** (`high - low`), matching
every other candlestick producer in this tree. A period missing any of the four
prices draws no candle, so it is left out of the reading entirely — counting it
would expect a mark that was never drawn.

**A box plot is read but not outlined.** The values need no deriving — the
five-number summary arrives already computed. The *highlight* is what cannot
be had: `BoxSelector` wants a selector per part (the whiskers, the box, the
median, each outlier) and ECharts draws all of them as **one path**.
Colour-tagged, a two-box chart yields exactly two filled paths, and each `d`
runs box-rectangle, `Z`, then the whiskers:

```
M177.5 234.59 L227.5 234.59 L227.5 150.41 L177.5 150.41 Z M202.5 27…
```

There is nothing to name the parts with. The default paint is also `#fff`,
which the mark filter counts as furniture, so the mark would be dropped even
if the shape fitted.

**Its outliers are empty, because the series carries none.** ECharts draws
them as a *separate* `scatter` series by its own convention — there is no
seventh dimension holding them. An accompanying scatter is read as the
scatter it is, and keeps its own highlighting: the boxplot is deliberately
excluded from the per-datum mark pool, so it cannot spend a slot and shift
the scatter's selectors onto the wrong elements.

## Hierarchies and graphs [experimental]

Five more series types own the whole chart rather than sitting on a grid, and
each maps onto a MAIDR trace that already exists.

| ECharts | read as | payload | highlighted |
|---|---|---|---|
| `treemap` [experimental] | `treemap` | `TreemapPoint[]` | **no** — see below |
| `sunburst` [experimental] | `sunburst` | `TreemapPoint[]` | yes — one selector per node |
| `tree` [experimental] | `tree` | `TreemapPoint[]` | **no** — see below |
| `sankey` [experimental] | `sankey` | `FlowPoint[]` | no |
| `graph` | `network` [experimental] | `NetworkPoint[]` | no |

**The synthetic root is dropped.** Measured: `data.tree.root` is a node
ECharts adds above whatever the author wrote — its name is the empty string
and its value is the sum of everything below. The real forest is
`root.children`, so the walk starts one level down and the `path` it records
drops that empty name.

**An interior node's value is only emitted when it is the author's.**
`node.getValue()` answers the rolled-up sum for an interior node, and ECharts
writes that sum back into the raw data, so reading the data back cannot tell a
declared value from a derived one. `TreemapPoint.y` wants exactly that
distinction, and it is recoverable by comparing: a node whose value equals its
children's sum has none of its own, and one that differs is carrying mass no
child accounts for. Measured on a chart with both — `A` (children 1 and 2,
nothing declared) reports 3; `B` (declared 5, one child of 2) reports 5.

**The nodes come from the links.** A `FlowPoint` and a `NetworkPoint` each
name their two ends, so neither reading emits a node list — a separate one
would be a second source of truth for something the links already say. Node
names come from `data.getName(node.dataIndex)`; there is no `node.name`.

### Why only a sunburst is outlined

Established by giving every node an explicit `itemStyle.color` and reading the
fills in document order — reading the default palette had suggested otherwise:

- **`sunburst`** paints one mark per node, in exactly the order the tree walk
  produces them. That is why the reading walks the tree rather than the data:
  a sunburst reorders its children, so the two orders differ.
- **`treemap`** paints only its **leaves**. Interior nodes are the white
  borders between them, so a count against the node total can never match, and
  the leaf order is not the walk order either.
- **`tree`** draws its node symbols `#fff` whatever `itemStyle` says, and this
  adapter counts white as furniture — so there is nothing to name.
- **`sankey` and `graph`** both navigate *links* while the marks are *nodes*.
  There is no per-link element to name, so the cursor and the marks would be
  addressing different things.

## Theme rivers, parallel coordinates and radars [experimental]

Three more series types own the chart without sitting on the x/y grid, and
none of them carries a hierarchy or a graph.

| ECharts | read as | payload | highlighted |
|---|---|---|---|
| `themeRiver` | `stacked_area` [experimental] | `SegmentedPoint[][]` | yes — one selector per band |
| `parallel` | `parallel_coordinates` [experimental] | `LinePoint[][]` | **no** — see below |
| `radar` [experimental] | `radar` | `LinePoint[][]` | yes — one selector per series |

**A theme river's rows are flat.** Measured, the series carries
`['time', 'value', 'name']` with one row *per band per instant* — six rows
for three instants of two bands — and `getName(i)` answers the band's name
rather than a category label. Grouping those rows is the only way the bands
come apart, and they are emitted in first-appearance order, which is the
order the chart stacks them in.

**Its `time` is epoch milliseconds.** Announced raw it would read as
"1577836800000", so an instant is turned back into the date it is:
`2020-01-01` when it lands exactly on a UTC midnight, and the full timestamp
otherwise, so a chart drawn at finer than daily resolution is not rounded.

**A parallel plot's axis names live off the series.** The series carries one
row per observation and columns named `dim0`, `dim1`, … ; the names those
columns are drawn under are on the `parallelAxis` components. Each is placed
by its own `dim` rather than by the order it was declared in — an author may
write them in any order, and taking them as written would label every value
with its neighbour's variable. Every point names its own axis in `x`, which
is what `ParallelTrace` needs: it keys each axis's extent by name rather than
by column position, so a value is pitched against its own variable's range
even when an observation is short a reading
([#1182](https://github.com/xability/maidr/issues/1182)).

**A parallel plot is not highlighted; a theme river is.** A parallel plot's
polylines are *stroked*, so the mark finder — which pairs filled marks with
data — finds none at all: measured, zero marks for a two-observation chart.

The theme river took a correction. It shipped without an outline first, on
the reasoning that `stacked_area` is a segmented trace whose selectors are a
row per series *aligned to that series' points* — a pairing the drawing does
not offer, since it paints one filled path per **band** rather than one per
datum. The premise was wrong: `src/model/factory.ts` routes `STACKED_AREA` to
`AreaTrace`, which extends `LineTrace`, and a line takes **one selector per
series**. One filled path per band is exactly that shape. Verified live —
three bands give three selectors that resolve to three *distinct* paths.

**A radar's outline is a stroke, not a fill.** This one is worth spelling out
because the adapter got it wrong once. A radar was refused on the grounds
that a two-series chart "draws six vertex symbols and also fills its
alternating ring backgrounds, one of which (`rgb(234,237,245)`) is neither
furniture nor white, so seven marks are found where six are expected". That
counts the wrong mark class. `RadarTrace` wants one selector per **series**,
and the filled marks are one per **vertex** — three per series — so they
never fitted, ring background or not. Colour-tagging a two-series radar
shows what does:

```
FILLED    rgb(234,237,245)  ring background
          rgb(255,255,255)  ring background   (white -> furniture)
          #111199 x3        series one's vertex symbols
          #229922 x3        series two's vertex symbols
STROKED   #dbdee4           ring outline      unweighted -> furniture
          #cfd2d7 x3        spokes            unweighted -> furniture
          #111199 width=2   series one        <- the mark
          #229922 width=2   series two        <- the mark
```

One weighted stroke per series, in the series colour — the same shape
`markPerSeries()` already finds for a line. Its spoke names come from the
`radar` component's `indicator` array rather than from the series, whose own
dimensions are the positions `indicator_0`, `indicator_1`, ….

## Highlighting

ECharts gives a reading almost nothing to address by. Measured on 6.1.0: the
SVG is one flat `<g>` with **no ids, no `data-*` attributes** and only
generated `zr0-cls-N` classes; `dataIndex` is not set on the traversed zrender
elements in the production build; and the element-to-DOM-node mapping is not
exposed by any public property.

What the drawing does give is a clean separation by paint, with marks
contiguous in data order:

| what | fill | stroke |
|---|---|---|
| gridline, axis line | `none` | grey, unweighted |
| bar / scatter mark | the series colour | — |
| line | `none` | the series colour, `stroke-width: 2` |
| area fill | the series colour | none |
| hover symbol | white | the series colour |
| border artefact, axis-name background | black | — |

So the adapter finds marks by their paint, **checks the count against what the
model says was drawn**, stamps them, and builds selectors from the stamps. If
the counts disagree it drops the highlighting for that chart rather than
outlining the wrong datum — the same discipline the Google Charts Calendar
uses.

One consequence worth knowing: **a series painted pure black loses its
highlighting.** Its marks are indistinguishable from the furniture, so they are
excluded, the count check fails, and the chart reads without an outline. That
is the conservative failure, not a silent wrong one.

### On a canvas

A chart drawn to a canvas has no elements to point at, and ECharts' default
renderer is a canvas — Superset registers no other. The chart's model still
knows where every mark is. Measured on 6.1.0:

| series | where its marks are |
|---|---|
| `bar`, `pictorialBar` | `data.getItemLayout(i)` — `{ x, y, width, height }`, `height` signed |
| `scatter` | `data.getItemLayout(i)` — `[x, y]` |
| `pie` | `data.getItemLayout(i)` — `{ cx, cy, r0, r, startAngle, endAngle }` |
| `sunburst` | the same, per tree node, from `node.getLayout()` |
| `line` | `data.getLayout('points')` — one flat `[x0, y0, x1, y1, …]` per series |

All of these are in the chart's CSS pixels. A datum with no value comes back
with a `null` coordinate rather than being left out, so "has a finite layout"
is exactly "was drawn".

So the marks are drawn from the model into an `<svg>` laid over the canvas.
They are painted the way the SVG renderer paints them, at zero opacity, and
the pass that stamps an SVG chart's marks finds them there unchanged: the same
count check, the same stamps, the same selector shapes. A series type not in
the table draws nothing into the overlay, so the count check fails and the
chart reads without an outline, as it did before there was an overlay. The
overlay is replaced when the chart is drawn again somewhere else, and left
alone when it would come out the same.

### Which shape each layer's selectors take

A selector that resolves the right element is only half of it: each trace
class accepts a different **shape**, and a layer whose selectors are
individually right and collectively the wrong shape resolves nothing at all,
silently.

| layer | shape | what reads it |
|---|---|---|
| `bar` | one selector per bar | `AbstractBarPlot`'s array branch |
| `stacked`, `dodged` | a row of selectors per series | `SegmentedTrace.mapGridToSvgElements` |
| `scatter` | **one** selector naming the whole series | `ScatterTrace`, which casts `layer.selectors` to `string` |
| `line`, `area` | one selector per series | `LineTrace.mapToSvgElements` |
| `heat` | a row of selectors per grid row, bottom-first | `Heatmap`, which indexes by its own row |
| `candlestick` | `{ body: [...] }`, one per candle | `Candlestick.mapToSvgElements` |
| `sunburst` | one selector per node, in tree-walk order | `TreemapTrace` |
| `radar` | one selector per series, as a stroked outline | `RadarTrace` |

So the marks are stamped twice in one pass — once per mark and once per
series — and each layer takes the address its own trace can use.

A scatter needs one more thing from the model. ECharts does not move its
symbols into place; it scales them there, with
`transform="matrix(s, 0, 0, s, e, f)"` over a unit shape whose `d` always
begins `M1 0`. `ScatterTrace` recovers a mark's position from the DOM rather
than from the data's order, and it now reads that matrix — without it every
symbol reported the same coordinate and the whole scatter grouped into one
column (#1197).
