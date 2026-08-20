# Observable Plot & Quarto Integration

MAIDR provides an adapter for [Observable Plot](https://observablehq.com/plot) — the grammar-of-graphics library built on D3 — that turns its charts into accessible, navigable visualizations with audio sonification, text descriptions, braille output, and keyboard navigation.

There are two ways it gets used, and they differ only in how the scripts get onto the page:

| | You are writing | Load the scripts by | Your chart code changes |
|---|---|---|---|
| **[Plain page](#plain-page-quick-start)** | HTML, or an app that renders Plot charts | putting two `<script>` tags in `<head>` | not at all |
| **[Quarto](#quarto-quick-start)** | a `.qmd` with `{ojs}` cells | `include-in-header`, or `quarto add xability/maidr` | not at all |
| **[Framework](#observable-framework)** | a Framework project | `head` in `observablehq.config.js` | not at all |
| **[Embedded notebook](#embedded-notebooks)** | a page running `@observablehq/runtime` | two `<script>` tags on the host page | not at all |

The adapter itself does not know which one it is in. It watches the page for Plot charts and binds each one as it appears — that is the whole mechanism, and it is why neither case asks you to touch the code that draws the chart.

Quarto gets its own section because it is the case that *cannot* work any other way: an `{ojs}` cell's value **is** the chart, so there is nowhere in the cell to call a binder even if you wanted to. On a plain page you have the choice, and [Manual binding](#manual-binding) covers taking it.

## Plain page quick start

Two script tags. Draw charts however you already do.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Observable Plot chart</title>
    <!-- 1. MAIDR core, then the Observable Plot adapter -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/observable.js"></script>
  </head>
  <body>
    <div id="chart"></div>

    <script type="module">
      import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot/+esm';

      const data = [
        { day: 'Mon', count: 120 },
        { day: 'Tue', count: 240 },
        { day: 'Wed', count: 180 },
      ];

      document.querySelector('#chart').append(Plot.plot({
        title: 'Daily visitors',
        x: { label: 'Day' },
        y: { label: 'Visitors' },
        marks: [Plot.barY(data, { x: 'day', y: 'count' })],
      }));
      // Nothing else to do: the adapter binds the chart as it is inserted.
    </script>
  </body>
</html>
```

Tab to the chart. Arrow keys move between bars, `S` toggles sonification, `B` toggles braille, `T` toggles text descriptions.

A chart appended later — after a `fetch`, on a click, on every frame of a slider drag — is bound as it appears, and one the page throws away is released. So a dashboard that redraws does not accumulate charts, and you do not re-bind anything by hand.

If you install from npm rather than a CDN, `maidr/observable` is the entry point:

```js
import 'maidr';
import 'maidr/observable';
```

## Quarto quick start

Add the scripts to your document's header. Nothing else changes.

```yaml
---
title: "Palmer Penguins"
format:
  html:
    include-in-header:
      - text: |
          <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
          <script src="https://cdn.jsdelivr.net/npm/maidr/dist/observable.js"></script>
---
```

````markdown
```{ojs}
data = FileAttachment("penguins.csv").csv({ typed: true })
```

```{ojs}
Plot.plot({
  title: "Body mass by species",
  marks: [Plot.barY(data, Plot.groupX({ y: "mean" }, { x: "species", y: "body_mass_g" }))]
})
```
````

Render the document and Tab to the chart — the same keys as above.

To apply it to a whole project, put the same `include-in-header` block under `format: html:` in `_quarto.yml`.

### Reactive cells

An `{ojs}` cell that depends on a `viewof` input re-runs whenever the reader changes it, and the runtime replaces the chart node each time. The adapter watches for that and binds the replacement, so a chart driven by a slider stays navigable after every change — nothing to wire up.

````markdown
```{ojs}
viewof year = Inputs.range([2000, 2024], { step: 1, label: "Year" })
```

```{ojs}
Plot.plot({ marks: [Plot.barY(data.filter(d => d.year === year), { x: "region", y: "sales" })] })
```
````

### Quarto extension

If you would rather not paste the header block into every project, install the extension:

```bash
quarto add xability/maidr
```

Then add the filter to your document or `_quarto.yml`:

```yaml
filters:
  - maidr
```

The filter injects the same two scripts. `maidr-version` pins which release to load, and `maidr-base-url` points at your own copies instead of the CDN:

```yaml
filters:
  - maidr
maidr-version: "4.2.0"
```

## Observable's own runtimes

The two quick starts cover a page you control. Observable ships two other ways
to run Plot, and the adapter works in both — the mechanism is the same, so the
only question in each is where the two script tags go.

### Observable Framework

Put the bundles in your source root and name them in `head`. Framework rewrites
the paths and content-hashes the files for you, so `/maidr.js` resolves to
whatever it emitted:

```js
// observablehq.config.js
export default {
  root: 'src',
  head: '<script src="/maidr.js"></script><script src="/observable.js"></script>',
};
```

Charts in `display(Plot.plot(...))` cells bind as they render, and a cell driven
by `view(Inputs.range(...))` rebinds each time the reader moves the input.

### Embedded notebooks

A notebook embedded with `@observablehq/runtime` and `@observablehq/inspector`
works the same way: load the two bundles on the host page and every cell whose
value is a Plot chart becomes navigable, including cells the runtime re-runs
when you `redefine` a value.

**Verified against** Framework 1.13.4, runtime 5.9.9 and inspector 5.0.1 — the
charts bind, the reactive re-runs rebind, and the chart each re-run discards is
released rather than accumulated.

**Not verified:** a notebook on observablehq.com itself. The adapter needs its
two scripts on the page, and on a notebook hosted there you do not control the
page's head. Whether a cell can inject them into its own document is untested —
so it is an open question rather than a documented route.

## How it works

The adapter reads the chart that was drawn. Plot labels every mark it renders — a bar mark becomes `<g aria-label="bar">`, a scatter becomes `<g aria-label="dot">` — and hangs its scales off the element it returns. Running an element's geometry back through the matching scale recovers the datum it was drawn for, exactly: a bar drawn for `3.14159` is announced as `3.14159`, not as `3.141589999999809`.

That is why the adapter needs no configuration and works on charts written before MAIDR was in the picture, including ones you did not author.

## What it reads

| Plot mark | MAIDR trace | Notes |
|-----------|-------------|-------|
| `barY` / `barX` | Bar | Orientation comes from which axis is categorical |
| `barY` / `barX` with `fill` | Stacked bar | One series per fill colour, with a legend |
| the same under `stackY({offset: 'normalize'})` | 100% stacked bar | Announced as percentages |
| `rectY` / `rectX` with `binX` / `binY` | Histogram | Bin edges are reconstructed exactly |
| `rectY` / `rectX` with `binX` and a `fill` | Stacked bar | A stacked histogram, read over its bins |
| `rectY` / `rectX` on a categorical axis | Bar | |
| `dot` on two continuous axes | Scatter | |
| `dot` on a categorical axis | Dot plot | Navigated as a bar chart |
| `tickX` / `tickY` on a categorical axis | Strip plot | Read as a dot plot: one point per observation, so a category with several ticks keeps all of them |
| `line` | Line | One series per drawn path |
| `area` / `areaY` | Area | |
| `areaY` under `stackY({offset: 'normalize'})` | 100% stacked area | Announced as percentages |
| `linearRegressionY` / `linearRegressionX` | Smooth | The fitted line; see below |
| `dot` under `hexbin` | Hexbin | Only when declared — see below |
| `boxY` / `boxX` | Box | Four marks read as one distribution; see below |
| any of the above with `fx` / `fy` | Subplots | One MAIDR panel per facet, named after it |

Titles, subtitles, captions, and axis labels are taken from what Plot rendered. The directional arrows Plot draws into an axis label (`↑ Count`) are stripped.

## Hexbins

`Plot.dot(data, Plot.hexbin({ r: 'count' }, { x, y }))` is read as a lattice of bins — but **only when you say so**:

```js
observablePlotToMaidr(chart, { markTypes: { dot: 'hexbin' } });
```

The declaration is not a convenience, it is the only thing that can distinguish the chart. A hexbin's cells arrive in a group labelled `dot`, exactly like a scatter's, and Plot's own `symbol: 'hexagon'` draws the identical path shape at a different radius — the two are the same markup. `markTypes` is the option that already exists for this, and since a hexbin is a single mark, one label maps to one type.

What the declaration does *not* do is override the geometry. The cells still have to be hexagons: six vertices, at the positions a regular hexagon of that width puts them. A declaration pointing at diamonds, or at a bubble chart, is declined rather than read as a lattice of invented tallies.

Both halves of a bin then invert exactly, and neither goes through a colour — which is what separates this from `cell`, `contour` and `density` below:

- the **centre** is the cell's `transform`, through the x and y scales;
- the **tally** is the hexagon's radius through the `r` scale — a square root by default, so a bin holding five of nine points is drawn at `10·√(5/9) = 7.454`.

The tally is rounded to a whole number **when the drawing is unambiguous about it**. `HexbinPoint.count` is documented as "how many points fell in it", and the radius reaches the `d` attribute rounded to three decimals, so a bin of five inverts to 5.00059 — within the geometry's own error of an integer. A hexbin sized by something that is not a count, such as `r: 'mean'` over a weight, has a genuinely fractional tally and is left alone.

Rows are grouped on the cells' **y pixel**, which a hex lattice's rows share exactly, and are ordered from the bottom up — the direction the trace steps through them.

## Regression lines

`Plot.linearRegressionY` and `Plot.linearRegressionX` are read as smooth curves. This is the one mark Plot names after what it *means* rather than after what it draws — its group is `aria-label="linear-regression"`, which nothing else produces — so it needs neither a heuristic nor an option, unlike the box marks below.

The group holds two paths per series: the confidence band, drawn with `stroke="none"`, and the fitted line, drawn with `fill="none"`. They are told apart by that rather than by their order. A mark split by `stroke` gives one fit per series, each named from the colour scale.

The fitted line has exactly two vertices, its ends, and both are read along with the pixels they were drawn at. That is not a loss: a straight line is completely described by its ends, and what a reader gets is where the trend starts, where it finishes, and the slope between.

**The confidence band is not read.** `SmoothPoint` carries `x`, `y`, `svg_x` and `svg_y` and no bounds, and the smooth trace announces none, so an interval has nowhere to go on a smooth layer. Giving it one would serve r-maidr's `geom_smooth(se = TRUE)` and py-maidr's plotly trendline as much as this mark, and is a decision about the grammar rather than about Plot.

## 100% stacked charts

`Plot.stackY({ offset: 'normalize' })` divides before it draws, so a chart drawn with it is read as `stacked_normalized_bar` — or `stacked_normalized_area` for an area — rather than as an ordinary stack. Its values are announced as **percentages**, which is what every 100% chart MAIDR reads announces, and the reader is told the columns are parts of a whole.

What decides it is that **every column adds up to one**, not the shape of the y scale. A domain of exactly `[0, 1]` is the obvious signal and is the wrong one: widening the axis for headroom — `y: { domain: [0, 1.2] }` — draws a 100% chart whose domain is not `[0, 1]` and whose columns no longer span the frame, and a scale test misses it. Summing the columns catches that chart and needs no second signal.

The same test does not separate Plot's own normalization from an author who divided their numbers before drawing, and there is nothing there to separate: both are charts of shares. Values already written as `0.3` and `0.7` are announced as 30 and 70, the same as Plot's own.

## Step curves

A line drawn with `curve: 'step-after'`, `'step-before'` or `'step'` is a **step chart**: navigated by transition rather than by sample, described in runs, and announced as a step plot. Which convention drew it is read off the path rather than declared:

| Plot curve | announced as | the riser sits |
|---|---|---|
| `step-after` | `hv` | at the next sample |
| `step-before` | `vh` | at the current sample |
| `step` | `mid` | halfway between the two |

A staircase passes through every sample and adds a corner between each pair, so the samples are all on the path and the corners say which convention put them there. Every corner is checked, not just counted — a path that merely happens to carry the right number of vertices is refused, because reading it as a staircase would announce transitions the chart never drew.

The centred `step` needs one thing the other two do not. Its interior samples are **not on the path** — only the midpoints between them are — so they are recovered by walking out from the first, and the last sample, which *is* drawn, checks the result. The error does not accumulate along the series: measured over 50 samples at uneven spacing, the largest departure from the true pixel was 0.002, which is the quantum the coordinates were written at.

An **area** drawn with a step curve stays an area and carries the convention, which is what its trace reads to tell a stepped band's risers from its samples. A stacked one works too: the baseline is stepped alongside the top edge, so the two stay aligned.

This is the one reading in the adapter that is *detected* rather than declared, and it is worth knowing why. Plot binds the datum indices to the path, so how many samples there should be is known — which is what lets the surplus vertices be identified as corners rather than mistaken for data. A binder that reads its data from the source rather than from the drawing has no such handle, which is why MAIDR's d3 binder asks you to declare the convention instead.

A **date axis** works: values travel as epoch milliseconds — every trace's point type is numeric, because the value has to drive sonification and the min/max range — and the layer declares `format: { type: 'date' }`, which is what turns them back into dates in the announcement.

## Spike and vector marks

`Plot.spike` stands a magnitude at a place, and both halves are in the markup — the place is the mark's `transform`, and the magnitude is how far the spike reaches, put back through the `length` scale that sized it:

```js
const chart = Plot.plot({ marks: [Plot.spike(cities, { x: 'lon', y: 'lat', length: 'net' })] });
observablePlotToMaidr(chart);
```

It is announced as a scatter carrying `z`, which the trace speaks alongside the position *and* scales into an audio intensity across the layer's range, so the magnitude is both said and heard.

The scale sizes a distance, so the direction of the reach carries the sign: a magnitude of −8 is drawn reaching down by the same pixels a magnitude of 8 reaches up. Taken as a raw height, a spike map of net migration would announce every loss as a gain.

A magnitude of exactly zero is still a reading. Plot draws it as a triangle with no height, so the place is on the chart and the answer there is “none” — it is announced as `z: 0` rather than left out, which would put a silent hole in the middle of a map a reader is sweeping.

`Plot.vector` draws the same magnitude with a shaft and an arrowhead, and is read the same way — **unless it points somewhere**. A flow field's direction is usually what it was drawn for, and there is no field in the grammar for a bearing, so a vector given a `rotate` channel is turned away rather than announced as a spike with its direction silently dropped. Plot writes `rotate()` into the transform exactly when that channel was given, even where every value is zero, so what the reading asks is whether a direction was *encoded* — not whether it happened to vary.

A vector with no `length` channel is turned away too: every arrow is then drawn the same default height, and the only number available is the mark's own styling.

## Link and arrow marks

A `Plot.link` whose two ends share a coordinate is a **span** along the other axis, at one position on this one — an interval in a lane — and is read as a gantt:

```js
const chart = Plot.plot({ marks: [Plot.link(tasks, { y: 'task', x1: 'start', x2: 'end' })] });
observablePlotToMaidr(chart);
```

A gantt rather than a dumbbell, deliberately. The dumbbell shape says the two ends are a comparison — before and after, two groups, two years — and only the dots that usually sit at each end suggest that. Those are a separate mark with their own label, so pairing them would mean inferring a composite out of two independently labelled groups, and Plot leaves nothing behind that says they belong together. `GanttPoint` claims only a lane and two positions, which is exactly what a link draws; the dots keep being read as the scatter they are.

Both orientations work, and so does a `curve`: Plot joins a link's two endpoints with a single command whatever the curve, so the connector's shape never becomes a position. `Plot.arrow` is read the same way — its head goes into the same `d` as a second subpath, and those vertices are dropped rather than taken for an end.

A lane holding several intervals and a lane holding none are both kept: the intervals nest under their lane, and an empty lane stays as an empty row, named from the scale's domain. That is a real statement about a schedule and the one a flat list cannot make.

What is **not** read is a link whose ends share nothing — an edge in a node-link diagram, which has no lane to sit in and no interval to announce. The question is asked of the whole mark rather than of each path: one `link` can hold spans and edges together, and reading three spans out of four paths would announce a gantt quietly missing a quarter of its chart.

## Rule marks

`Plot.ruleX` and `Plot.ruleY` are how Plot draws a high–low chart, a range plot and a gantt, and a rule carrying an interval is read as the same gantt a `link` produces:

```js
const chart = Plot.plot({ marks: [Plot.ruleY(tasks, { y: 'task', x1: 'start', x2: 'end' })] });
observablePlotToMaidr(chart);
```

A rule is exact. A `<line>` carries both of its ends as attributes, so there is no path to tokenise and nothing rounded to undo — unlike a link, whose `d` is written at three decimals and has to be cleaned back to the value it came from.

Both orientations work, and a lane holding several intervals keeps them nested under that lane, as a link's do.

**A rule that agrees with itself is not a measurement.** Three other things wear the same label, and each gives itself away by ending where every other line ends:

- a reference line, `Plot.ruleY([5])`, drawn from the x range's minimum to its maximum because Plot handed it the frame — and drawn *across* the lanes of the chart it annotates rather than along one, which is the shape that turns it away;
- a positional rule, `Plot.ruleX(data, {x})`, drawn the full height of the frame at every position, with no value in it at all;
- a lollipop's stems, `Plot.ruleX(data, {x, y})`, which all start at the baseline — announced as intervals they would say “0 to 8” where the chart means “8”, and the `dot` at each tip is already read as the value.

Both ends are asked the same question, because which one Plot writes a constant into is the caller's spelling: `y1: 'v', y2: 0` and `y1: 0, y2: 'v'` are the same lollipop.

A candlestick's wicks are read this way too. `Plot.boxY`'s own whiskers are not, because a box plot is claimed as one composite and read as a box; but a chart that only *looks* like a box plot — a bullet chart, a candlestick with a marker in its body — is declined as a box and its marks go back to the readings they belong to. A bullet's rule stands on the baseline and is declined again here; a candlestick's wick floats at both ends, which is what a high and a low are, so it comes back as the range it draws.

The cost is a rule mark holding one line, and a gantt whose rows genuinely all begin — or all end — together. Those are drawn exactly as the cases above and the markup cannot separate them. The trade goes the other way from the constant floor above, because there refusing would cost a chart its only reading, while here what is being refused is either not data at all or already announced by the mark beside it.

## Waffle charts

`Plot.waffleY` and `Plot.waffleX` are read as bar charts of their tallies:

```js
const chart = Plot.plot({ marks: [Plot.waffleY(sales, { x: 'region', y: 'units' })] });
observablePlotToMaidr(chart);
```

The tally is measured rather than approximated. A waffle draws each category as one `<path>` around its filled cells — a rectangle when they fill whole rows, a staircase when the last row is partial — and fills it with a `<pattern>` that gives the cell's size, so the count is the outline's area over the cell's. Nothing is inverted from a colour.

What gets announced is the height those cells would have as a solid bar, put back through the y scale. That matters because a cell is not always one unit: `unit: 5` draws 12 as 2.4 cells, and announcing the cell count would report 2.4. Going through the scale returns what the axis shows and never has to know what `unit` was.

The lattice's width is taken across the whole mark, not off one path. A category holding less than a full row is only as wide as the cells it drew, so on its own it understates how many columns there are — and some category always fills a row, because Plot sizes the lattice to the largest value.

`waffleX` needs no separate arithmetic: it lays its cells along the band rather than up it, so each outline is a plain rectangle and the same area gives the same count. A `fill` channel puts one path per segment in the same band and is read as a stacked bar; the series colour is on the pattern's swatch rather than on the path, which carries only `url(#…)`. A category holding nothing is still drawn — every vertex on the origin — and is announced as the zero it is rather than dropped. A fractional tally stays fractional.

## Box plots

`Plot.boxY` and `Plot.boxX` are read as a MAIDR box trace, with no option to set:

```js
const chart = Plot.plot({ marks: [Plot.boxY(penguins, { x: 'species', y: 'body_mass' })] });
observablePlotToMaidr(chart);
```

Each category is announced with its five-number summary and its outliers, and
every one of those numbers is recovered from the pixels the chart was drawn at.

A box plot is not a mark in Plot: it is a `rule` for the whiskers, a `bar` for
the interquartile box, a `tick` for the median and a `dot` for the outliers,
drawn as four independent groups whose labels are exactly those of a hand-drawn
rule, bar and tick. Two things identify it.

**How the parts sit on one another.** Every median lies inside its box and every
whisker runs along it. An error-bar chart and a bar chart with a target line
draw the same three marks without either holding.

**That Plot drew the median as a box plot's median.** The arrangement alone is
not conclusive: a floating rect inside a rule with a line across it is a box
plot's shape, and equally a bullet chart's (a qualitative range, a measure, a
target) or a candlestick's with a marker in its body. Those are ordinary charts
and reading one as a distribution would announce its two ends as the quartiles.
`Plot.boxY` builds its median from a `tick` with `strokeWidth: 2`, which a tick
mark does not otherwise carry, so the adapter asks Plot what it drew rather than
inferring it from where things sit. Overriding the box's `fill` or `stroke` does
not disturb this; a box plot styled by its author still reads.

Because the second answers what the geometry cannot, the first can stay loose
enough to be true of every box plot. A whisker usually reaches past both ends of
its box, but outliers move a quartile, and enough of them on one side pull it
beyond the whisker — so the box sticks out, and requiring containment left that
chart unread with its medians announced as a dot plot instead. A whisker now
only has to run along its box, not around it.

No author declaration is involved, and a chart that fails either test is not
claimed at all: its marks are handed back and read as whatever they are, so a
bullet chart is announced as the bar chart and target it is rather than going
out silent.

One more thing has to hold before anything is announced: the parts must pair up
one-to-one along the category axis. A chart with an extra tick, or a whisker
with no box, is left unread rather than announced with a part borrowed from the
wrong category.

Two details worth knowing:

- **The whiskers highlight as one.** Plot draws a whisker as a single `<line>`
  spanning both ends, so the minimum and the maximum resolve to the same
  element. The announcement still moves between them; the outline does not.
  Splitting the line would mean inserting elements into your chart, which this
  adapter does not do.
- **Outlier values come from the pixels**, like everything else. Plot binds a
  datum *index* to an outlier rather than the observation, and the adapter never
  sees your source data.

## What it does not read

- **`cell` marks (heatmaps).** A cell keeps its magnitude in an 8-bit fill colour, so several distinct values render as the same colour and no inversion can tell them apart. Announcing an approximation to a reader who cannot check it against the picture is worse than announcing nothing, so these marks are skipped.
- **A `tick` with no cross-channel.** `Plot.tickX(data, {x: 'v'})` draws every tick across the whole frame, which is a one-dimensional distribution with no category to announce — and a dot plot's point has a second field the chart has nothing to put in. A tick given a categorical `y` (or `x`) is read; one without is not.
- **Lines whose path does not pass through the data.** `curveBasis` and `curveBundle` draw through control points that are not data points. The adapter detects the mismatch — Plot binds the datum indices to the path, so the expected vertex count is known — and skips the mark rather than announcing the smoothing. `curveLinear` (the default), `curveCatmullRom`, `curveMonotoneX`, `curveNatural` and `curveCardinal` are read normally, and the step curves are read as **step charts** (below).
- **A stack whose rows were not aggregated.** Two rows sharing a category and a series draw two segments that the stack transform left separate; there is one cell in a stacked layer for them and two marks on screen. The layer is read as a plain bar chart instead, which announces both.
- **An area whose floor follows the data.** Given `y1` and `y2` off the data an area is an interval — a confidence band, a min/max range, `Plot.bollingerY`'s band — and the distance from its lower bound to its upper one is the interval's width, not a value. Read as a magnitude, a band drawn at 8/12, 11/15, 9/13 and 13/17 announced a flat 4, which its own y axis contradicts. What separates that from an ordinary area is whether the floor moves: a level floor is one the chart chose — the baseline, which Plot draws at the value zero whatever the y domain says, or a constant `y1` — and the height above it is a magnitude, which is why an area raised onto a fixed base is still read. A stack's floors move too, and there they really are data, which the stack test settles first. MAIDR has a shape for a value with an interval around it, `SmoothPoint`'s `yMin`/`yMax`, but a band on its own has no centre to carry one, so the mark is handed back rather than given a value it does not state. A `bollingerY` chart's moving average is an ordinary line beside the band and is still read.
- **A line or area with a gap in it.** Plot ends the series at a missing value and starts a new subpath after it, so one `d` holds several. The vertices are then a subpath's opening move, the corners, and whichever samples fall in between — and pairing them off with the samples announces a corner as data and drops the gap. The count that catches the smoothed curves above cannot catch this one, because a break moves the vertex count and leaves it matching by coincidence: measured on 0.6.17, a `step-after` or `step-before` line whose `y` goes null lands back on its own sample count, and so does a `step-after` area whose `x` does. What the drawing says instead is in the `M` commands, and a mark drawn in more than one piece is turned away. Nothing drawn without a gap is affected — every whole line and area Plot draws is a single subpath — and a gap in one mark does not stop the others on the chart being read.

A chart whose marks are all unread is left alone; other charts on the page are unaffected.

## Precision

A bar, a dot, and a rect are positioned by attributes the adapter reads directly, so inverting them recovers the datum exactly: a bar drawn for `3.14159` is announced as `3.14159`, not as `3.141589999999809`.

A **line or area** is different. Its vertices come back out of the path's `d` attribute, where the serializer has already rounded each coordinate, so the value is only good to the quantum that rounding left. The adapter rounds to that precision and no finer — on an ordinary chart the quantum is worth far less than the last decimal of the data and the value comes back exact, but a line spanning tens of thousands of units will be announced to the nearest hundredth or so. Reporting the inverted figure in full would present a rounded pixel as an exact measurement.

**Bin edges** are reconstructed rather than measured. Plot insets a binned rect so neighbouring bars are visually separated, which puts every measured edge a pixel inside the true one, and the spacing between bars gives the bin width back exactly. A chart whose bins are not evenly spaced — author-set thresholds — cannot be reconstructed that way and keeps its measured edges, which are inset by that pixel.

Three more things worth knowing:

- **Navigation follows the axis, except where the marks overlap.** Plot draws in the order the data arrived, which `sort` makes something other than the visual order, so the adapter puts each layer in axis order and *moves the elements to match* — reordering siblings only changes paint order, and marks that tile do not paint over each other. Marks that do overlap keep draw order instead, because moving one there would change the picture; on such a chart the arrow keys will not sweep strictly left to right. The highlight always matches what was announced either way.
- **A chart the adapter cannot read faithfully is left unbound.** When Plot's `scale` function is missing — a chart revived from saved HTML rather than drawn on the page — the scales are fitted from the rendered axis ticks. That fit describes a linear axis, so a log axis is refused rather than approximated, and a quantitative axis whose labels cannot be read back is refused too. No announcement beats a confident wrong one.
- **Plot 0.6.3 or later.** The adapter reads the separate axis groups Plot has emitted since 0.6.3. Quarto currently bundles Plot 0.6.11.

## Manual binding

Auto-binding is what both quick starts rely on, and on a plain page it is optional. When you want the schema instead — to edit it, or to hand it to the `<Maidr>` React component — call the adapter yourself, and turn the watcher off first so it does not bind the chart behind you.

```js
// Before the bundle loads, if you are loading it with a script tag.
window.maidrObservableAutoInit = false;
```

```js
import { bindObservablePlot, observablePlotToMaidr } from 'maidr/observable';

const chart = Plot.plot({ marks: [Plot.barY(data, { x: 'day', y: 'count' })] });
document.body.append(chart);

// Bind it, and get the schema back.
const { maidr } = bindObservablePlot(chart, {
  title: 'Daily visitors',
  axes: { x: 'Day', y: 'Visitors' },
});

// Or get the schema without handing it to the runtime.
const { maidr: schema } = bindObservablePlot(chart, { autoApply: false });
```

Both of them read the chart in place and write to it: the selectors they generate point at an id and at attributes the adapter stamps on the marks, so the chart has to be in the document and will not come back untouched. What `autoApply: false` skips is the last step — writing `maidr-data` and telling the runtime — not the stamping. `observablePlotToMaidr` is the conversion on its own and never takes that step, so it ignores the option entirely.

Script-tag users get the same functions on `window.maidrObservable`.

### Options

| Option | Type | Description |
|--------|------|-------------|
| `id` | `string` | Figure id. Generated when omitted. |
| `title` / `subtitle` / `caption` | `string` | Override what Plot rendered. |
| `axes` | `{ x?, y?, z? }` | Override the drawn axis labels. |
| `markTypes` | `Record<string, string>` | Force a mark's trace type, keyed by its Plot `aria-label`. |
| `autoApply` | `boolean` | `false` returns the schema without writing it to the DOM. |

### Turning auto-binding off

Set the flag before the bundle loads, then drive it yourself:

```html
<script>window.maidrObservableAutoInit = false;</script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/observable.js"></script>
<script>
  // Watch only part of the page, or bind charts one at a time.
  maidrObservable.initObservablePlots({ root: document.querySelector('#report') });
</script>
```

`initObservablePlots` returns a function that stops the watcher.

## Keyboard Controls

Once a chart is focused, use standard MAIDR keyboard shortcuts:

| Function | Key (Windows) | Key (Mac) |
|----------|--------------|-----------|
| Move between data points | Arrow keys | Arrow keys |
| Move between panels (facets) | Page Up / Page Down | Page Up / Page Down |
| Go to extremes | Ctrl + Arrow | Cmd + Arrow |
| Toggle Sonification | S | S |
| Toggle Braille Mode | B | B |
| Toggle Text Mode | T | T |
| Toggle Review Mode | R | R |
| Auto-play | Ctrl + Shift + Arrow | Cmd + Shift + Arrow |
| Stop Auto-play | Ctrl | Cmd |

For the full list, see the [Keyboard Controls](docs/CONTROLS.html) reference.

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
