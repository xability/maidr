# Highcharts Integration

MAIDR provides a dedicated adapter for [Highcharts](https://www.highcharts.com/) that converts a rendered chart instance into MAIDR-compatible data. Once converted, the chart is fully accessible via audio sonification, text descriptions, braille output, and keyboard navigation.

Highcharts is **not bundled** — bring your own copy. The adapter only reads from the Highcharts chart API; it has zero runtime dependency on Highcharts itself.

## Quick Start

Render your chart with Highcharts, convert it with `maidrHighcharts.highchartsToMaidr()`, attach the result as a `maidr-data` attribute, and let MAIDR pick it up:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Highcharts Chart</title>
    <!-- 1. Load Highcharts -->
    <script src="https://cdn.jsdelivr.net/npm/highcharts/highcharts.js"></script>
    <!-- 2. Load MAIDR core + the Highcharts adapter -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/highcharts.js"></script>
  </head>
  <body>
    <div id="chart" style="width: 700px; height: 500px"></div>

    <script>
      // 3. Render your chart normally
      const chart = Highcharts.chart('chart', {
        chart: { type: 'column' },
        title: { text: 'Tips by Day' },
        xAxis: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
        yAxis: { title: { text: 'Count' } },
        series: [{ name: 'Tips', data: [20, 14, 23, 25, 22] }],
      });

      // 4. Convert and attach to the container
      const maidrData = maidrHighcharts.highchartsToMaidr(chart, { id: 'chart' });
      document.getElementById('chart').setAttribute('maidr-data', JSON.stringify(maidrData));

      // 5. (Optional) bidirectional tooltip + point highlighting
      maidrHighcharts.createHighchartsSync(chart);
    </script>
  </body>
</html>
```

The adapter exposes a global `maidrHighcharts` object with `highchartsToMaidr()` and `createHighchartsSync()`. This works directly from `file://` URLs — no module server required.

Once the page loads, click on the chart (or Tab to it) and MAIDR activates with:

- **Audio sonification** — tones representing data values
- **Text descriptions** — spoken via screen readers
- **Braille output** — refreshable braille display support
- **Keyboard navigation** — arrow keys to move between data points

## How It Works

The adapter pipeline runs in three short steps:

1. **Read** — `highchartsToMaidr(chart)` reads `chart.series`, `chart.xAxis`, `chart.yAxis`, `chart.title`, and (when present) `chart.subtitle` / `chart.caption`. Each series is mapped to a MAIDR `TraceType` based on its rendered type (`bar`, `line`, `scatter`, etc.) and Highcharts `stacking` mode.
2. **Locate** — Scoped CSS selectors are generated per chart container so MAIDR can highlight the correct SVG element for the active data point.
3. **Sync (optional)** — `createHighchartsSync(chart)` wires MAIDR's navigation events back into Highcharts' native `tooltip.refresh()` and `point.setState('hover')`, so the visual cursor follows the user as they navigate.

## Installation

### CDN (script tags — works on `file://` and any web server)

```html
<script src="https://cdn.jsdelivr.net/npm/highcharts/highcharts.js"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/highcharts.js"></script>
<script>
  // Globals: Highcharts, maidrHighcharts
  const maidrData = maidrHighcharts.highchartsToMaidr(chart, { id: 'chart' });
</script>
```

> **CDN note:** Use `cdn.jsdelivr.net/npm/highcharts/...` rather than `code.highcharts.com/...` for local `file://` testing — the official Highcharts CDN's WAF blocks requests with no `Referer` header (which `file://` origins always send), returning HTTP 403. jsDelivr does not have this restriction.

### ESM (modern build tooling / bundlers)

```html
<script src="https://cdn.jsdelivr.net/npm/highcharts/highcharts.js"></script>
<script type="module">
  import { createHighchartsSync, highchartsToMaidr } from 'https://cdn.jsdelivr.net/npm/maidr/dist/highcharts.mjs';
</script>
```

> ESM imports require an HTTP(S) origin (CORS blocks them on `file://`). For local-file demos, use the UMD `dist/highcharts.js` bundle above.

### npm

```bash
npm install maidr highcharts
```

```ts
import Highcharts from 'highcharts';
import { createHighchartsSync, highchartsToMaidr } from 'maidr/highcharts';
```

## Supported Chart Types

| MAIDR Type | Highcharts series type(s) | Example |
|------------|---------------------------|---------|
| Bar | `bar`, `column`, `columnpyramid` (requires `modules/pyramid3d.js` or `highcharts-more.js`), `pictorial` (requires `modules/pictorial.js`) | [highcharts-bar.html](examples/highcharts-bar.html) |
| Line | `line`, `spline` | [highcharts-line.html](examples/highcharts-line.html) |
| Step | `line`, `spline` + `step: 'left' \| 'center' \| 'right'` | [highcharts-line.html](examples/highcharts-line.html) |
| Area | `area`, `areaspline` | [highcharts-area.html](examples/highcharts-area.html) |
| Stacked Area | `area`/`areaspline` + `stacking: 'normal'`, `streamgraph` (requires `modules/streamgraph.js`) | [highcharts-area.html](examples/highcharts-area.html) |
| Normalized Area | `area`/`areaspline` + `stacking: 'percent'` | [highcharts-area.html](examples/highcharts-area.html) |
| Scatter | `scatter` on numeric axes, `bubble` (requires `highcharts-more.js`) on any axis | [highcharts-scatter.html](examples/highcharts-scatter.html) |
| Dot Plot | `scatter` on a category x axis | [highcharts-dot.html](examples/highcharts-dot.html) |
| Lollipop | `lollipop` (requires `highcharts-more.js`, `modules/dumbbell.js` and `modules/lollipop.js`) | [highcharts-lollipop.html](examples/highcharts-lollipop.html) |
| Funnel | `funnel`, `pyramid` (requires `modules/funnel.js`) | [highcharts-funnel.html](examples/highcharts-funnel.html) |
| Word Cloud | `wordcloud` (requires `modules/wordcloud.js`) | [highcharts-wordcloud.html](examples/highcharts-wordcloud.html) |
| Sankey | `sankey` (requires `modules/sankey.js`), `arcdiagram` (requires `modules/sankey.js` and `modules/arc-diagram.js`) | [highcharts-sankey.html](examples/highcharts-sankey.html) |
| Chord | `dependencywheel` (requires `modules/sankey.js` and `modules/dependency-wheel.js`) | [highcharts-chord.html](examples/highcharts-chord.html) |
| Network | `networkgraph` (requires `modules/networkgraph.js`) | [highcharts-network.html](examples/highcharts-network.html) |
| Treemap | `treemap` (requires `modules/treemap.js`) | [highcharts-treemap.html](examples/highcharts-treemap.html) |
| Sunburst | `sunburst` (requires `modules/sunburst.js`, which ships treemap) | [highcharts-sunburst.html](examples/highcharts-sunburst.html) |
| Gauge | `gauge`, `solidgauge` (require `highcharts-more.js`; solid gauge also `modules/solid-gauge.js`), `bullet` (requires `modules/bullet.js`) | [highcharts-gauge.html](examples/highcharts-gauge.html) |
| Waterfall | `waterfall` (requires `highcharts-more.js`) | [highcharts-waterfall.html](examples/highcharts-waterfall.html) |
| Error Bar | `errorbar` (requires `highcharts-more.js`), reading its estimates from the series it is `linkedTo`; `arearange`, `areasplinerange`, `columnrange` (require `highcharts-more.js`), each read as the band of intervals it draws | [highcharts-errorbar.html](examples/highcharts-errorbar.html) |
| Dumbbell | `dumbbell` (requires `highcharts-more.js` and `modules/dumbbell.js`) | [highcharts-dumbbell.html](examples/highcharts-dumbbell.html) |
| Gantt | `gantt` (requires `modules/gantt.js`), `xrange` (requires `modules/xrange.js`) | [highcharts-gantt.html](examples/highcharts-gantt.html) |
| Radar | `chart.polar: true` with `line`/`spline`/`area`/`areaspline` series (requires `highcharts-more.js`) | [highcharts-radar.html](examples/highcharts-radar.html) |
| Polar Area | `chart.polar: true` with `column`/`bar` series — a wind rose or coxcomb (requires `highcharts-more.js`) | [highcharts-radar.html](examples/highcharts-radar.html) |
| Parallel Coordinates | `chart.parallelCoordinates: true` (requires `modules/parallel-coordinates.js`) | [highcharts-parallel.html](examples/highcharts-parallel.html) |
| Diverging Bar | two `column`/`bar` series with `stacking: 'normal'`, one growing each way | [highcharts-diverging.html](examples/highcharts-diverging.html) |
| Bump | `line`/`spline` series carrying ranks on a `reversed` y axis | [highcharts-bump.html](examples/highcharts-bump.html) |
| Hexbin | `tilemap` with a tessellating `tileShape` — `hexagon` (the default), `diamond` or `circle` (requires `modules/heatmap.js` and `modules/tilemap.js`) | [highcharts-hexbin.html](examples/highcharts-hexbin.html) |
| Volcano | `scatter` declared with `significancePlot: { type: 'volcano' }` | [highcharts-volcano.html](examples/highcharts-volcano.html) |
| Manhattan | `scatter` series, one per chromosome, declared with `significancePlot: { type: 'manhattan' }` | [highcharts-manhattan.html](examples/highcharts-manhattan.html) |
| Survival | `line`/`spline` declared with `custom.maidr: { type: 'survival' }`, absorbing a linked `scatter` and `arearange` | [highcharts-survival.html](examples/highcharts-survival.html) |
| Forest | the estimate series declared with `custom.maidr: { type: 'forest', … }`, taking its interval from the `errorbar` linked over it | [highcharts-forest.html](examples/highcharts-forest.html) |
| Box Plot | `boxplot` | [highcharts-box.html](examples/highcharts-box.html) |
| Heatmap | `heatmap` (requires `modules/heatmap.js`) | [highcharts-heatmap.html](examples/highcharts-heatmap.html) |
| Choropleth | `map` (Highmaps — requires `maps/highmaps.js` and a map topology) | [highcharts-choropleth.html](examples/highcharts-choropleth.html) |
| Histogram | `histogram` (requires `modules/histogram-bellcurve.js`) | [highcharts-histogram.html](examples/highcharts-histogram.html) |
| Candlestick | `candlestick`, `ohlc` (Highstock) | [highcharts-candlestick.html](examples/highcharts-candlestick.html) |
| Stacked Bar | `column`/`bar` + `plotOptions.column.stacking: 'normal'` | [highcharts-stacked.html](examples/highcharts-stacked.html) |
| Dodged (Grouped) Bar | `column`/`bar` (default, no stacking) with multiple series | [highcharts-dodged.html](examples/highcharts-dodged.html) |
| Normalized Bar | `column`/`bar` + `plotOptions.column.stacking: 'percent'` | [highcharts-normalized.html](examples/highcharts-normalized.html) |
| Pie | `pie` (a doughnut is a `pie` with an `innerSize`) | [highcharts-pie.html](examples/highcharts-pie.html) |
| Mosaic | `variwide` (requires `modules/variwide.js`) | [highcharts-variwide.html](examples/highcharts-variwide.html) |
| Smooth | `bellcurve` (requires `modules/histogram-bellcurve.js`) | [highcharts-bellcurve.html](examples/highcharts-bellcurve.html) |
| Line (Pareto) | `pareto` (requires `modules/pareto.js`) — the cumulative curve over a bar chart | [highcharts-pareto.html](examples/highcharts-pareto.html) |
| Labelled scatter | `timeline` (requires `modules/timeline.js`) — a row of named events | [highcharts-timeline.html](examples/highcharts-timeline.html) |

> **Pie note:** a pie series is bound to no axis, so `axes.x` and `axes.y` are named `Label` and `Value` rather than read from an axis title. Highcharts renders the wedges in `series.data` order, so slice *k* is wedge *k* and highlighting is index-aligned without any extra configuration. The same holds for funnel and word cloud layers, whose dimensions are named `Stage`/`Count` and `Term`/`Weight`.

> **Pareto note:** a `pareto` series is the cumulative curve Highcharts draws over a bar chart's columns, as its own series — so it reads as a second `line` layer beside the bar layer the columns already produce, which is what the chart is. **Its numbers are percentages, not a running total.** Measured on Highcharts 11 over base counts of 80, 60, 40, 20 (total 200), the series carries 40, 70, 90, 100 rather than 80, 140, 180, 200 — so nothing converts them back into counts, because the chart does not draw counts. The axis they are bound to is the secondary one the author titled, conventionally "Cumulative %", which `getAxisLabel` reads off the series' own axis.

> **Bell curve note:** a `bellcurve` series fits a normal distribution to another series and evaluates it at points the *renderer* chooses, so it is read as a `smooth` rather than a `line`. Measured on Highcharts 11: the same nine observations give 19 points by default and 31 under `pointsInInterval: 5`, so the sample count is a drawing parameter and announcing those points as a series of observations would hand a reader a sample size the chart invented. The observations are a separate series — `baseSeries` — which the adapter reads on its own terms, so a chart drawing both gets both. The axes are the curve's own, which is where a bell curve is conventionally drawn: a curve bound to a secondary pair is named by that pair's titles rather than by the base series'.

> **Timeline note:** a timeline is a row of named events, and its whole payload is *which events happened, in what order* — so it is read as a scatter whose points carry `label`. **`y` is a constant.** Measured on Highcharts 11: `point.y` came back `1` on every event of every timeline, dated and undated alike, so the layer carries that 1 and sonifying it plays one pitch for the whole row, which is what a chart with no magnitude sounds like. Pitching by `x` instead would announce a magnitude the chart does not draw. What the reader gets is the sequence — the scatter trace pans by distinct x value — and each event's own name. Each event's label is both of the strings its box draws, joined: `name` on the first line and `label` on the second, and on the ordinary timeline, whose x axis is hidden and whose `x` is a bare 0, 1, 2, 3, `label` is the only place the date appears at all. `description` is not folded in — it is the tooltip's text rather than anything drawn, and the grammar has one string per point.

> **Column-family note:** `columnpyramid` and `pictorial` are a column drawn differently — a tapered outline, and a repeated icon — and carry the same `point.y` per category that `column` does, so they read as bars. `streamgraph` is a stacked area under its own series name and reads as one. `bubble` reads as a scatter rather than as a dot plot even on a category axis, because a dot plot is one value per category and a bubble has two — the category name is not lost either way, it travels as `xLabel`. All four were read before they were written down here; the omission was in this guide rather than in the adapter.

> **Variwide note:** a variwide is a column chart whose widths carry a second quantity, so it is read as a mosaic rather than as a bar: `BarPoint` is `{x, y}` and has nowhere to put the width, which is half of what the chart draws. `point.y` is the column's height and `point.z` its width, and the share `MosaicPoint.width` carries is `z / sum(z)` — measured on Highcharts 11 to be the fraction of the plot each column is drawn at, to the pixel. No `count` is emitted: a mosaic is usually drawn from a contingency table, but a variwide's `z` is any measure at all, and declaring one would announce "Count 83.2" for a chart of millions of people. Each series becomes its own mosaic, since two variwide series are drawn side by side and each sizes its columns from its own total.

> **Area note:** every `area`/`areaspline` series in one panel becomes a single area layer, because a stacked band's running total only exists when all the bands share a layer. A stacked area is read as such — each point announces its own height alongside the total it sits in — and a percent stack carries the shares Highcharts computed, which is what the chart draws. `step` is not carried through on an area series: a layer holds one trace type, and announcing a stacked area as a step layer would drop the totals.

> **Dot plot note:** a scatter drawn against a category axis is a Cleveland dot plot, and is emitted as one. MAIDR's scatter payload takes a strictly numeric `x`, so reading such a series as a scatter would announce the bare tick index instead of the category the chart prints.

> **Word cloud note:** Highcharts lays a cloud out heaviest word first, so the adapter emits its terms in that order to keep each announcement matched with the glyph it highlights. A word Highcharts could not fit into the playing field is not drawn at all; MAIDR then reports the terms and their weights but disables highlighting for that layer, rather than pairing announcements with the wrong glyphs.

> **Flow note:** a sankey, dependency wheel and arc diagram are the same weighted graph — the latter two extend the sankey series — declared as one point per link with `from`, `to` and `weight`. MAIDR derives the nodes from those links, so `series.nodes` is deliberately not read: a second node list would be a second source of truth for something the links already say. Only the announced chart type differs between the three, so the chart names itself as the form the author drew. A link whose weight is zero is dropped, because Highcharts renders no ribbon for it. A network graph is the same shape without the weight, and carries no node positions: where a force solver drops a node is a fact about its seed rather than about the data.

> **Hierarchy note:** Highcharts declares a treemap or sunburst with `id`/`parent` pointers, and MAIDR declares one as a path — a node's ancestors, root first, itself excluded — so the adapter walks each node's parent chain to build it. A parent id that was never declared ends the path there, matching how Highcharts attaches such a node to the root, and a cyclic chain is broken with a warning rather than followed. Interior nodes keep whatever value they declared and are otherwise left valueless, since MAIDR derives an interior total from the children the paths give it. Both series file their marks into one DOM group per depth ordered by z-index, so document order says nothing about declaration order; the adapter stamps `data-maidr-node-index` onto each rendered node and the selectors address the stamp. A node Highcharts did not draw leaves MAIDR with fewer elements than nodes, and highlighting is withdrawn for that layer rather than paired with the wrong rectangles.

> **Gauge note:** a gauge layer's data is a single object rather than an array, because the chart draws exactly one measure; a series declaring several dials is read as its first. The dial's ends come from the value axis' extremes, a bullet chart's target from the point, and the qualitative bands from the axis' `plotBands`, sorted ascending because MAIDR carries only each band's upper edge. Highcharts bands are usually drawn in colour and named nowhere, so a band with neither a `label.text` nor a styled-mode `className` is numbered by its position in the partition. The three series draw the reading differently — a needle carrying no point class, an arc that is an ordinary point, a bar beside a target marker that also carries the point class — so each has its own highlight selector.

> **Waterfall note:** Highcharts declares only what each step contributes, while MAIDR's step also carries the absolute positions its bar floats between, so the adapter accumulates the running total as it walks the series. The two kinds of restating bar are placed the way Highcharts draws them: an `isSum` step spans the baseline to the running total, an `isIntermediateSum` step spans the previous subtotal's edge to the current running total. Both are announced as `total` steps and are left out of "largest contribution", since they restate a number rather than contribute one.

> **Error bar note:** Highcharts splits the reading across two series. The error bar carries the interval — `low` and `high`, already absolute positions on the value axis, which is the form MAIDR wants — while the ESTIMATE lives in the series it is `linkedTo`, normally the column or scatter it is drawn over. The adapter resolves that parent and zips the two together by x into one layer carrying all three magnitudes, and then leaves the parent out of the bar layer it would otherwise have become, so the same estimates are not announced twice in a layer that has lost the interval. A parent with samples the error bar skips keeps its own layer, so no sample goes unannounced. An unlinked error bar still reads: the estimate is taken as the midpoint of the interval, which is where such a chart draws it. A point without a `high` is dropped, because `pointValKey` is `high` and Highcharts places no whip without it.

> **Dumbbell note:** MAIDR announces which end of the pair the cursor is on, and Highcharts names neither — a dumbbell point declares a `low` and a `high` and nothing that says what either one is. Pass `dumbbellLabels: { start, end }` to `highchartsToMaidr` to supply them; without it MAIDR says "start" and "end", which tells a reader which dot they are on but not which year it is. `low` is the start. Highlighting targets the connector between the two dots rather than the dots themselves: MAIDR wants one element per row, and the connector is also the one Highcharts always draws — it drops the markers once the points get dense enough to overlap.

> **Gantt note:** MAIDR nests a gantt's intervals by lane, because a lane with nothing booked is a real statement about a schedule and only a nested list can make it. Highcharts draws the intervals in `series.data` order, which interleaves lanes freely, so the adapter regroups them and stamps `data-maidr-task-index` onto each rendered interval in the regrouped order — MAIDR slices its selector list lane by lane, so document order cannot be indexed into. The lanes come from the y axis' categories, which a Gantt chart's tree grid axis builds from the tasks and an xrange declares outright. A milestone becomes a zero-length interval at its own instant, which is what the diamond shows. A Highcharts datetime axis counts milliseconds, so `ms` is the announced unit: `start` and `end` stay in the axis' own numbers, since that is what places them where the chart draws them.

> **Polar note:** `chart.polar` and `chart.parallelCoordinates` are chart-wide drawing modes rather than series types — a radar's spokes are still `line` series and a wind rose's wedges still `column` ones — so the adapter reads the flags before it groups the series, or the spokes would be merged into an ordinary line or bar layer announcing the wrong chart. Under a polar chart an `area` series is one more outline around the spokes rather than a band with a baseline to stack on, so it joins the radar layer instead of an area one. A radar's outline is a single closed path whose last vertex repeats its first; MAIDR trims the repeat, so highlighting is spoke-aligned without any extra configuration. A parallel coordinates chart that is also polar — a star plot — is read as parallel coordinates: every column is still a different quantity, which is what decides how it has to be pitched. Highcharts draws the per-variable names as the x axis' categories rather than as axis titles, so that is where the adapter reads them, falling back to `yAxis[i].title.text` for a chart that titled them instead.

> **Diverging note:** Highcharts has no diverging series type, so the chart is recognised from its data: exactly two stacked series, one entirely at or below zero and the other entirely at or above it. That is a narrow shape — a genuine stack puts its segments on the same side of the baseline so they accumulate — and the reading it selects is the safer one where the two overlap, since a segmented layer pitches a signed value directly and would make a two-million cohort drawn to the left sound smaller than a ten-thousand cohort drawn to the right. The values keep their sign; the trace pitches the magnitude and names the side.

> **Bump note:** Highcharts has no bump series either — the chart is its own line-chart demo pattern, one line per competitor over a `yAxis.reversed` axis so that rank 1 is drawn at the top — so this too is recognised from the data, and narrowly. Both halves have to hold: the value axis is reversed, **and** at every period the values across the series are exactly 1..k with no duplicates. That second half is what keeps a depth profile or a golf scorecard out, because reading one as ranks is not a degraded reading: MAIDR inverts the pitch for a bump chart, so an ordinary line chart read as one sonifies every value upside down. Pass `bump: true` to force the reading on a rank table the heuristic declines (ties, or ranks that skip), or `bump: false` to suppress it on a permutation that is not a standings table. A ragged table reads correctly — ranks are keyed by the period's label, so a competitor that joined late is compared against the others in the periods it actually ran. `step` is not carried through: a rank table is one layer whatever its lines are drawn like.

> **Hexbin note:** a tilemap is a heatmap whose tiles tessellate, and the shape decides which it reads as — `square` tiles are the aligned grid a heatmap already is, while every other shape staggers alternate columns so the tiles interlock, which is the lattice `HexbinTrace` navigates by. Two things this reading is honest about. **Highcharts never binned anything:** the tiles are supplied pre-binned, so a bin's count is whatever magnitude the author gave the tile, and a tile with no value counts as zero, which is what an empty bin is. **The centres are the authored ones:** the half-row shift is applied in pixel space during `translate` and never reaches the point, so announcing a shifted coordinate would put the bin somewhere nothing else on the page — the tooltip included — agrees with. The bins are regrouped into lattice rows and ordered along x within each, since a tilemap is routinely authored in some other order entirely (a honeycomb map is declared country by country); the adapter stamps `data-maidr-bin-index` onto each rendered tile in that order and the selectors address the stamp. A tile Highcharts did not draw leaves MAIDR with fewer elements than bins, and highlighting is withdrawn for that layer rather than paired with the wrong tiles — which on a staggered lattice is not even a neighbour in the direction a reader would guess.

> **Volcano and Manhattan note:** Highcharts ships neither series. Both are drawn as an ordinary `scatter` with the cutoff as a `plotLine`, and nothing in the chart object distinguishes one from a scatter of two variables — so the reading is **declared**, never guessed, with `significancePlot: { type: 'volcano' | 'manhattan' }`. Every scatter series in the panel is read as one cloud by default, which is what a Manhattan needs: it is one genome drawn as one series per chromosome, and its threshold spans all of them. Name `seriesIndices` to read only some of them. The point's `name` travels as the label and the series name as the group, because identity is the payload on these charts — a reader told "x is 2.3, y is 14.1" has been given the two numbers the axes already describe and withheld the gene. The cutoffs default to the lines the chart already draws: the first numeric `yAxis.plotLines` value is the significance cutoff, and the magnitude of the first non-zero `xAxis.plotLines` value is a volcano's effect cutoff. That last default is a **volcano's alone**. A volcano's x is fold change, so a line across it is a cutoff; a Manhattan's x is genomic position, where the lines a chart draws are chromosome dividers. Reading one as an effect would test every point's position against a divider's coordinate, reject nearly all of them, and leave both the significance summary and the significant-points rotor filter empty — so a Manhattan gets an effect cutoff only by stating `effect` outright. `significanceDirection` is passed through only when stated — MAIDR reads `above`, which suits a -log10(p) axis, and a **raw p axis runs the other way** and must say so, or the reading selects exactly the points that failed to reach significance and announces them as the finding. A layer that ends up declaring no cutoff at all carries no `thresholdOptions`, and MAIDR reads the cloud without making any claim about significance.

> **Choropleth note:** the Highmaps `map` series is the one chart in this list that needs no configuration at all — `map` is a series type of its own, and its siblings `mapbubble` and `mappoint` are different charts under different names, so nothing plainer wears the configuration. What makes it a map rather than a bar chart whose categories happen to be places is the **centroids**: `ChoroplethTrace` walks north, south, east and west out of a longitude and a latitude, and the grammar takes those in **degrees** and in nothing else. The adapter reads them from the two places that state degrees outright — the map feature's own `hc-middle-lon` / `hc-middle-lat`, and the map view's `projectedUnitsToLonLat` applied to the anchor Highcharts placed the shape's label at — and drops any reading that could not be a coordinate. A map with no geographic projection therefore gets no centroids, which is correct: its units are not degrees, and a wrong compass direction is worse than the region list in declared order the grammar sanctions when the pair is missing. `neighbors` is not emitted at all — Highcharts knows which shapes it drew, not which of them share a border, and centroids do not answer it either, so the trace is told nothing about borders rather than something guessed. A region the chart shades as null has no value to announce and is left out; the announced regions are stamped with `data-maidr-region-index` and the selectors address the stamp, so a map with a gap in it still highlights the country it is talking about. The dimensions are named `Region` and `Value`, since a map series is bound to no axis a title could be read from.

> **Survival note:** a Kaplan-Meier curve is indistinguishable from any other step chart by inspection, so it is **declared**: without the declaration the same series is a step layer, correct about every number and silent about the median survival and the censoring that are what the figure is read for. Write `custom: { maidr: { type: 'survival' } }` on the curve. The figure is up to three Highcharts series and one MAIDR layer: the curve carries the estimates, a linked `scatter` draws the censoring ticks, and a linked `arearange` draws the confidence band. Both companions are paired with Highcharts' own `linkedTo` — the mechanism the adapter already uses for error bars — matched to the curve by x, and suppressed from becoming layers of their own; a band read as its own area layer would announce the interval as if it were the estimate. A chart that does not link can name them with `censoredSeries` and `bandSeries`, by series `id`. Censoring is read from the curve's own rows first (`censored`, or whatever `censored:` names, falling back to `censor` and `isCensored`) and from the tick series second, and it is read **strictly**: `true`, `1`, `'1'` and `'true'` censor and nothing else does, because a truthy reading of the string `'0'` would censor every subject in a CSV. Sibling curves merge into further arms by default, since treated and control are read against each other and splitting them across layers puts the comparison the figure exists for behind a layer switch; set `merge: false` for curves that are genuinely separate charts. `stepDirection` comes from the series' own `step` option, or from the declaration for a curve drawn interpolated.

> **Forest note:** a forest plot is an error bar chart laid out on a categorical row axis, which the adapter already reads — what is **declared** is everything else, because none of it is in the chart object at all. Write `custom: { maidr: { type: 'forest', … } }` on the estimate series; the `errorbar` linked over it supplies the interval, or name it with `intervalSeries`. The **weight** is drawn as marker *area*, so it exists in the drawing as a radius and nowhere else: it comes from a column of the author's own rows (`weight`, falling back to `w` and `share`) or not at all. Inverting it back out of `point.marker.radius` is deliberately not attempted — the arithmetic depends on how the author scaled the markers, and it yields a confident number for every figure whose author never varied them. A weight outside 0 to 1 is a percentage rather than a share and is left out with a warning, since rescaling would guess that the column sums to a hundred. The **pooled row** is named by a flag column (`pooled`, falling back to `isPooled` and `summary`, read on the same strict table as `censored`), by `pooledIndex` for data that carries none — counted over the declaring series' rows as authored, dropped ones included — or by the companion series that draws its diamond, named with `pooledSeries`. The **null line** comes from `nullValue` in the declaration and from nowhere else: the adapter's `xAxis.plotLines` fallback belongs to a volcano's threshold and is not reused here, because a forest plot's axis carries reference lines for other reasons too and a guessed null reports every study as not crossing — a wrong answer handed to every row. A layer that declares none gets the estimate, the interval and the weight, and makes no claim about significance. An interval given as a positive offset rather than as bounds is named with `error` and normalised, losing to `yMin`/`yMax` where both are present.

### Series types that are deliberately not read

Every other Highcharts series type either has a reading above or is a spelling of one. These five are drawn, understood, and declined — a chart containing one gets no layer for it. They are listed so that a later sweep finds the reasons rather than re-deriving them.

| Series | Why it is declined |
| --- | --- |
| `venn` | Its magnitudes are overlap areas and its positions are a layout. There is no axis to announce a coordinate against. |
| `polygon` | An arbitrary closed shape with no statistical reading — already noted in `test/adapters/highcharts/arearange.test.ts`. |
| `vector`, `windbarb`, `flags` | Direction and annotation rather than a measured series. A vector's payload is an angle and a length at a position; a flag is a note pinned to a date. |
| `packedbubble` | It has a magnitude, but the positions are a packing rather than data — announcing a bubble's x and y would report where the layout put it. |
| `organization` | Blocked on the core rather than on the adapter — see below. |

> **Organization note:** an organization chart is a pure hierarchy, and the hierarchy itself is exact and readable: `series.nodes` carries each node's `id`, `name` and `linksTo`, and every node draws its own `path.highcharts-node.highcharts-point` inside the series group in `series.nodes` order. What is missing is a magnitude. Measured on a six-node chart, every node's `value` and `weight` came back `null`, and Highcharts' own internal `sum` was `1` for every node alike because it assigns one unit per link for layout — so there is no number anywhere in the declaration.
>
> `TraceType.TREEMAP` is the grammar's only hierarchy, and it cannot express that. Driving a valueless tree through `TreemapTrace`, **omitting `y`** announces `value: 0` on every node with `freq { min: 0, max: 0 }` — no pitch range at all — and **declaring `y: 1`** is worse: it announces `Share of Ada: 100.0%` for *both* of Ada's two children, because a declared parent value overrides the derived total that would have summed to 2. Either way every node states a magnitude the chart does not draw, which is the same objection this guide already makes about emitting `count` for a variwide.
>
> An org chart read as a tree would be a real improvement on the nothing it gets today — navigation, the ancestry breadcrumb and the child count are all correct and useful. So this is declined pending [#1153](https://github.com/xability/maidr/issues/1153), which is about giving the tree a way to say it has no magnitude, rather than pending anything here. One further guard for whoever picks it up: `TreemapPoint.path` is *one* ancestry, so a node with two parents cannot be expressed and such a chart should be declined rather than have a parent picked for it.

## Declaring What a Series Means

Survival and forest layers are drawn with a Highcharts series type they share with something plainer, so the reading is declared rather than guessed. (A choropleth is not: the `map` series names itself, and an author writes nothing.) The declaration is a `maidr` block on the series the author already wrote, in `custom` — the subspace Highcharts documents as "a reserved subspace to store options and values for customized functionality":

```js
series: [{
  id: 'treated',
  type: 'line',
  step: 'left',
  custom: { maidr: { type: 'survival', censored: 'censored' } },
  data: [/* … */],
}]
```

Two rules decide how a field is written. **A fact that differs per point names a column of your own rows; a fact that is the same for the whole layer carries the value itself** — so `weight` is a field name and `nullValue` is a number. **Every field is spelled exactly like the grammar field it fills, and every field name defaults to that same name** — so a row that already carries a `weight` column needs no `weight:` at all. The accepted spellings are listed on `MaidrTraceDeclaration` in `src/type/declaration.ts`, which this adapter re-exports.

The block is checked when it is read and never throws. A `type` that names no trace type, a key the declared type does not accept, and a value of the wrong kind are each warned about on the console with the series named, and the reading degrades to the undeclared chart rather than to a confident wrong one. Companion series are named by `id`, never by index — an index into a series list goes stale the moment a series is filtered or reordered.

This adapter reads a co-located block for `survival`, `forest` and `choropleth`. A block naming any other trace type is warned about by name and the series is read as the undeclared chart it is drawn as — so declaring `volcano` or `manhattan` on a series does nothing but log. `significancePlot` remains the way to declare those two here, and it is chart-level: it names the scatters through `seriesIndices`, not through a block on any one of them.

## Multi-Panel Charts

MAIDR supports two multi-panel patterns. In both cases the panels become a MAIDR subplot grid: arrow keys move between panels, `Enter` drills into a panel, and `Escape` returns to panel navigation.

### Panes within one chart

A single Highcharts chart can stack multiple panes via `yAxis` `top`/`height` (and side-by-side via `xAxis` `left`/`width`) — the classic Highstock price + volume layout. `highchartsToMaidr()` detects panes automatically from the rendered axis geometry and emits one subplot per pane. No new API is needed:

```js
const chart = Highcharts.chart('panes-chart', {
  title: { text: 'ACME Stock — Price and Volume' },
  xAxis: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
  yAxis: [
    { title: { text: 'Price ($)' }, height: '60%' },
    { title: { text: 'Volume' }, top: '70%', height: '30%', offset: 0 },
  ],
  series: [
    { type: 'line', name: 'Price', data: [150, 152, 149, 153, 155], yAxis: 0 },
    { type: 'column', name: 'Volume', data: [1200, 1450, 980, 1610, 1330], yAxis: 1 },
  ],
});

const maidrData = maidrHighcharts.highchartsToMaidr(chart, { id: 'panes-chart' });
```

Notes:

- Each pane's panel name comes from its first series' name, falling back to the pane's y-axis title.
- Highstock's internal navigator series is excluded automatically.
- Ambiguous layouts (overlapping axis bands, dual-axis overlays sharing the same plot area) safely fall back to today's single-panel output.

See [highcharts-panes.html](examples/highcharts-panes.html) for a full example.

### Multiple chart instances (small multiples)

Highcharts has no native faceting API — small multiples are built as separate chart instances in separate divs. `highchartsGridToMaidr()` combines them into one MAIDR figure (one subplot per chart). Attach the result to a wrapper element enclosing all the chart divs:

```js
const charts = [
  Highcharts.chart('region-north', { title: { text: 'North' }, /* ... */ }),
  Highcharts.chart('region-east', { title: { text: 'East' }, /* ... */ }),
  Highcharts.chart('region-south', { title: { text: 'South' }, /* ... */ }),
  Highcharts.chart('region-west', { title: { text: 'West' }, /* ... */ }),
];

const maidrData = maidrHighcharts.highchartsGridToMaidr(charts, {
  title: 'Quarterly Sales by Region',
  layout: { columns: 2 }, // chunk the flat list into a 2x2 grid
});

document.getElementById('wrapper').setAttribute('maidr-data', JSON.stringify(maidrData));
```

Pass charts in visual reading order (top-left first). A 2D array (`Chart[][]`) maps rows 1:1 instead of using `layout`. Each chart's own title becomes its panel name. If a member chart itself contains multiple panes (stacked `yAxis` bands), the same pane detection as `highchartsToMaidr()` applies: each pane becomes its own cell, flattened into that chart's grid row (a console warning notes the flattening). See [highcharts-grid.html](examples/highcharts-grid.html) for a full example.

## API Reference

### `highchartsToMaidr(chart, options?)`

Converts a rendered Highcharts chart into a `Maidr` data object.

| Parameter | Type | Description |
|-----------|------|-------------|
| `chart` | `HighchartsChart` | Return value of `Highcharts.chart()` (the chart must already be rendered). |
| `options.id` | `string?` | Override the generated chart ID. Defaults to `highcharts-{n}`. |
| `options.title` | `string?` | Override the chart title. Defaults to `chart.title.textStr`. |
| `options.seriesIndices` | `number[]?` | Convert only specific series by index. Default: all visible series. |
| `options.dumbbellLabels` | `{ start?: string; end?: string }?` | What a dumbbell chart's two ends are called — `low` is the start. Default: MAIDR announces them as "start" and "end" (see the dumbbell note above). |
| `options.bump` | `boolean?` | Force (`true`) or suppress (`false`) the bump reading of the chart's line series. Default: decided from the data (see the bump note above). |
| `options.significancePlot` | `object?` | Read the chart's `scatter` series as one volcano or Manhattan plot: `{ type: 'volcano' \| 'manhattan', seriesIndices?, significance?, significanceDirection?, effect? }`. The only way to declare a volcano or Manhattan here — a series' own `custom.maidr` block is not read for either type yet. Default: absent, and the scatters are read as scatters. |

Returns a `Maidr` object ready to assign to a `maidr-data` attribute, pass to the `<Maidr>` React component, or serialize for downstream tooling. Multi-pane charts produce a subplot grid (see [Multi-Panel Charts](#multi-panel-charts)).

### `highchartsGridToMaidr(charts, options?)`

Combines multiple rendered chart instances into one `Maidr` figure with subplot navigation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `charts` | `HighchartsChart[]` or `HighchartsChart[][]` | Rendered chart instances in visual reading order. A 2D array maps 1:1 to the subplot grid (ragged rows OK). |
| `options.id` | `string?` | Override the generated figure ID. Defaults to `highcharts-grid-{n}`. |
| `options.title` | `string?` | Figure-level title announced for the whole grid. |
| `options.subtitle` | `string?` | Figure-level subtitle. |
| `options.caption` | `string?` | Figure-level caption. |
| `options.layout` | `{ rows?: number; columns?: number }?` | Chunks a flat chart list into a grid (`columns` = charts per row). Ignored for 2D input. |

Charts with no convertible series are skipped with a console warning; if **no** chart in the grid produces any convertible series, an `Error` is thrown (attaching an empty figure would break MAIDR on focus). A member chart with multiple panes contributes one cell per pane, flattened into its row. Attach the returned JSON as `maidr-data` on a wrapper element that encloses all the chart containers.

### `createHighchartsSync(chart)`

Creates a bidirectional sync controller so the MAIDR cursor and Highcharts' native tooltip/highlight stay in lock-step. Returns a `HighchartsSync` object with a `dispose()` method for cleanup.

```ts
const sync = maidrHighcharts.createHighchartsSync(chart);
// ... user navigates with MAIDR; Highcharts tooltip follows automatically
sync.dispose();
```

### Type exports

```ts
import type {
  HighchartsAdapterOptions,
  HighchartsAxis,
  HighchartsChart,
  HighchartsGridOptions,
  HighchartsPoint,
  HighchartsSeries,
  HighchartsSync,
} from 'maidr/highcharts';
```

These are **minimal structural types** — they describe just the subset of the Highcharts API that the adapter actually reads, so MAIDR can stay version-independent of Highcharts releases.

## Code Examples

### Bar / Column Chart

```js
const chart = Highcharts.chart('bar-chart', {
  chart: { type: 'column' },
  title: { text: 'Number of Tips by Day' },
  xAxis: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], title: { text: 'Day' } },
  yAxis: { title: { text: 'Count' } },
  series: [{ name: 'Tips', data: [20, 14, 23, 25, 22] }],
});

const maidrData = maidrHighcharts.highchartsToMaidr(chart, { id: 'bar-chart' });
document.getElementById('bar-chart').setAttribute('maidr-data', JSON.stringify(maidrData));
```

### Multi-Line Chart

```js
const chart = Highcharts.chart('line-chart', {
  chart: { type: 'line' },
  title: { text: 'Weekly Sales Comparison' },
  xAxis: { categories: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7'], title: { text: 'Week' } },
  yAxis: { title: { text: 'Sales ($K)' } },
  series: [
    { name: 'Series A', data: [10, 15, 13, 17, 22, 19, 25] },
    { name: 'Series B', data: [16, 5, 11, 9, 14, 20, 12] },
  ],
});
```

### Scatter Plot

```js
const chart = Highcharts.chart('scatter-chart', {
  chart: { type: 'scatter' },
  title: { text: 'Iris Sepal vs Petal Length' },
  xAxis: { title: { text: 'Sepal Length (cm)' } },
  yAxis: { title: { text: 'Petal Length (cm)' } },
  series: [{
    name: 'Setosa',
    data: [[5.1, 1.4], [4.9, 1.4], [4.7, 1.3], [4.6, 1.5], [5.0, 1.4]],
  }],
});
```

### Box Plot

```js
const chart = Highcharts.chart('box-chart', {
  chart: { type: 'boxplot' },
  title: { text: 'Sepal Length Distribution' },
  xAxis: { categories: ['Setosa', 'Versicolor', 'Virginica'] },
  yAxis: { title: { text: 'Sepal Length (cm)' } },
  series: [{
    name: 'Observations',
    data: [
      // [low, q1, median, q3, high]
      [2.3, 2.7, 3.0, 3.4, 4.5],
      [4.7, 5.2, 5.9, 6.3, 7.0],
      [6.0, 6.5, 7.1, 7.5, 8.0],
    ],
  }],
});
```

### Heatmap

> Requires the Highcharts heatmap module: `<script src="https://cdn.jsdelivr.net/npm/highcharts/modules/heatmap.js"></script>`.

```js
const chart = Highcharts.chart('heatmap-chart', {
  chart: { type: 'heatmap' },
  title: { text: 'Activity Heatmap' },
  xAxis: { categories: ['Mon', 'Tue', 'Wed'] },
  yAxis: { categories: ['Morning', 'Afternoon', 'Evening'] },
  colorAxis: { min: 0, minColor: '#FFFFFF', maxColor: '#7CB5EC' },
  series: [{
    name: 'Activity',
    data: [[0, 0, 1], [0, 1, 20], [0, 2, 30], [1, 0, 20], [1, 1, 1], [1, 2, 60]],
  }],
});
```

### Histogram

> Requires the Highcharts histogram module: `<script src="https://cdn.jsdelivr.net/npm/highcharts/modules/histogram-bellcurve.js"></script>`.

```js
const chart = Highcharts.chart('histogram-chart', {
  title: { text: 'Distribution of Values' },
  series: [
    { type: 'histogram', name: 'Histogram', baseSeries: 's1', binsNumber: 15 },
    { type: 'scatter', id: 's1', name: 'Samples', data: samples, visible: false },
  ],
});
```

### Candlestick

> Requires Highstock: `<script src="https://cdn.jsdelivr.net/npm/highcharts/highstock.js"></script>`.

```js
const chart = Highcharts.chart('candlestick-chart', {
  chart: { type: 'candlestick' },
  title: { text: 'Stock Price' },
  xAxis: { categories: ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'] },
  yAxis: { title: { text: 'Price ($)' } },
  series: [{
    name: 'AAPL',
    data: [
      // [open, high, low, close]
      [150.0, 153.0, 149.0, 152.5],
      [152.5, 154.0, 151.0, 151.0],
      [151.0, 154.5, 150.0, 153.0],
      [153.0, 155.0, 152.0, 154.5],
    ],
  }],
});
```

### Stacked Bar

```js
const chart = Highcharts.chart('stacked-chart', {
  chart: { type: 'column' },
  title: { text: 'Quarterly Revenue Breakdown' },
  xAxis: { categories: ['Q1', 'Q2', 'Q3', 'Q4'] },
  yAxis: { title: { text: 'Revenue ($M)' } },
  plotOptions: { column: { stacking: 'normal' } },
  series: [
    { name: 'Product A', data: [20, 14, 23, 25] },
    { name: 'Product B', data: [15, 18, 20, 22] },
  ],
});
```

### Dodged (Grouped) Bar

```js
const chart = Highcharts.chart('dodged-chart', {
  chart: { type: 'column' },
  title: { text: 'Quarterly Sales by Product' },
  xAxis: { categories: ['Q1', 'Q2', 'Q3', 'Q4'] },
  yAxis: { title: { text: 'Revenue ($M)' } },
  // No `stacking` option = grouped (dodged) by default.
  series: [
    { name: 'Product A', data: [20, 14, 23, 25] },
    { name: 'Product B', data: [15, 18, 20, 22] },
  ],
});
```

### Normalized (Percent-Stacked) Bar

```js
const chart = Highcharts.chart('normalized-chart', {
  chart: { type: 'column' },
  title: { text: 'Quarterly Revenue Share by Product' },
  xAxis: { categories: ['Q1', 'Q2', 'Q3', 'Q4'] },
  yAxis: { title: { text: 'Share (%)' } },
  plotOptions: { column: { stacking: 'percent' } },
  series: [
    { name: 'Product A', data: [20, 14, 23, 25] },
    { name: 'Product B', data: [15, 18, 20, 22] },
  ],
});
```

### Pie Chart

```js
const chart = Highcharts.chart('pie-chart', {
  chart: { type: 'pie' },
  title: { text: 'Units Sold by Fruit' },
  series: [{
    name: 'Fruit sales',
    data: [
      { name: 'Apples', y: 30 },
      { name: 'Bananas', y: 50 },
      { name: 'Cherries', y: 20 },
      { name: 'Dates', y: 15 },
    ],
  }],
});

const maidrData = maidrHighcharts.highchartsToMaidr(chart, { id: 'pie-chart' });
document.getElementById('pie-chart').setAttribute('maidr-data', JSON.stringify(maidrData));
```

Left and Right move between slices; Up and Down are out of bounds, since a pie is a single row. Each slice announces its label, its value, and its share of the whole — "Apples, 30, 26.1%". Adding `plotOptions: { pie: { innerSize: '50%' } }` makes it a doughnut, which reads identically.

## Advanced Usage

### Inverted charts (horizontal bars)

The adapter inspects `chart.options.chart.inverted` and produces a horizontal-oriented MAIDR layer when set. No extra configuration is needed:

```js
Highcharts.chart('h-bar', {
  chart: { type: 'bar', inverted: true },
  // ...
});
```

### Filtering series

Pass `seriesIndices` to convert only specific series:

```js
const maidrData = maidrHighcharts.highchartsToMaidr(chart, {
  id: 'chart',
  seriesIndices: [0, 2], // skip series index 1
});
```

### Visual sync lifecycle

`createHighchartsSync()` attaches event listeners to the chart container. Always call `sync.dispose()` if you destroy the chart manually (otherwise listeners leak):

```js
const sync = maidrHighcharts.createHighchartsSync(chart);

// later:
chart.destroy();
sync.dispose();
```

### Re-rendering charts

If you call `chart.update()` or `chart.addSeries()`, re-run `maidrHighcharts.highchartsToMaidr()` and update the `maidr-data` attribute so MAIDR sees the new state. Reload `maidr.js` only on first mount.

## Keyboard Controls

Once a chart is focused, use standard MAIDR keyboard shortcuts:

| Function | Key (Windows / Linux) | Key (macOS) |
|----------|----------------------|-------------|
| Move between data points | Arrow keys | Arrow keys |
| Go to extremes | Ctrl + Arrow | Cmd + Arrow |
| Toggle Sonification | S | S |
| Toggle Braille Mode | B | B |
| Toggle Text Mode | T | T |
| Toggle Review Mode | R | R |
| Auto-play | Ctrl + Shift + Arrow | Cmd + Shift + Arrow |
| Stop Auto-play | Ctrl | Cmd |

For the full list, see the [Keyboard Controls](docs/CONTROLS.html) reference.

## Integration Comparison

| Feature | Vanilla JS (CDN) | React Component | Highcharts Adapter |
|---------|------------------|-----------------|--------------------|
| Setup | `maidr-data` attribute with JSON | `data` prop on `<Maidr>` | `highchartsToMaidr(chart)` + attribute |
| Data source | Manual JSON schema | Manual JSON schema | Auto-extracted from chart instance |
| SVG selectors | Manual CSS selectors | Manual CSS selectors | Auto-generated, scoped per container |
| Chart types | All MAIDR types | All MAIDR types | 10 Highcharts series types |
| Visual tooltip sync | Manual | Manual | Built-in via `createHighchartsSync()` |

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
