# Tableau Integration

MAIDR ships a Tableau *binder* for the [Tableau Embedding API v3](https://help.tableau.com/current/api/embedding_api/en-us/index.html). One call — `bindTableau(viz)` — reads the summary data out of an embedded `<tableau-viz>` worksheet or dashboard and mounts MAIDR's accessible layer beside it, adding audio sonification, text descriptions, braille output, keyboard navigation, and a description modal to a visualization that a screen reader otherwise reaches only as a static image with a tooltip.

> **What this adapter is not.** It does **not** run inside Tableau as a dashboard extension, and it does **not** draw a highlight box. A `<tableau-viz>` is a cross-origin `<iframe>`: the host page cannot read its SVG, cannot inject ARIA into it, and cannot style anything inside it. Everything the adapter knows comes from the asynchronous data API, and the only visual feedback it can produce is Tableau's **own mark selection**, driven from the keyboard as the reader navigates. See [Limitations](#limitations) before you plan around it.

## Quick Start

Load the Embedding API v3 library, MAIDR core, and the MAIDR Tableau adapter; place a `<tableau-viz>` pointing at a view; then bind once the viz reports that it is interactive.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Tableau View</title>
    <!-- 1. The Tableau Embedding API v3 — must be type="module". -->
    <script
      type="module"
      src="https://public.tableau.com/javascripts/api/tableau.embedding.3.latest.min.js"
    ></script>
    <!-- 2. MAIDR core, then the MAIDR Tableau adapter (UMD; exposes maidrTableau). -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/tableau.js"></script>
  </head>
  <body>
    <tableau-viz
      id="tableauViz"
      src="https://public.tableau.com/views/Superstore_embedded_800x800/Overview"
      toolbar="bottom"
      hide-tabs
    ></tableau-viz>

    <script type="module">
      // 3. Wait for FirstInteractive — nothing in the workbook is readable
      //    before it, and the data API rejects if you ask early.
      const viz = document.getElementById('tableauViz');
      viz.addEventListener('firstinteractive', () => {
        maidrTableau.bindTableau(viz, { title: 'Superstore Overview' });
      });
    </script>
  </body>
</html>
```

The binder inserts a focusable block **immediately before** the viz element. Tab to it (it is ahead of the iframe in DOM order, so a keyboard user reaches it before Tableau's own controls swallow focus), press <kbd>Enter</kbd>, and MAIDR activates with:

- **Audio sonification** — tones representing data values
- **Text descriptions** — announced through the screen reader
- **Braille output** — refreshable braille display support
- **Keyboard navigation** — arrow keys through data points, Page Up / Page Down between dashboard worksheets
- **Mark selection** — the mark under the cursor is selected in the Tableau view itself, which is what a sighted colleague sees highlight

Two hosting notes, both from Tableau's own documentation:

- **The page must be served over `http(s)`, not opened from `file://`.** The Embedding API is an ES module; loading it from the file system fails CORS with `Access to script at 'file:///…' from origin 'null' has been blocked`. Any static server (`npx serve`, `python3 -m http.server`) is enough — no application server is involved.
- **Tableau Public views need no authentication.** Tableau Cloud and Tableau Server do; see [Limitations](#limitations).

## How It Works

The adapter never imports a Tableau package. It duck-types the live `<tableau-viz>` element the page already created, so it stays independent of the Embedding library's version.

1. **Find the worksheets.** `viz.workbook.activeSheet` is read once. A `worksheet` sheet is a single worksheet; a `dashboard` contributes `dashboard.worksheets`, in the order the author added them — which is also the order Tableau's own documentation says a screen reader narrates a dashboard. A `story` sheet is skipped with a warning (see [Limitations](#limitations)).
2. **Read the summary data.** For each worksheet the adapter calls `getSummaryColumnsInfoAsync()` for the columns *in view order*, then opens a `getSummaryDataReaderAsync()` and pages through it. The reader hands its columns back **alphabetically**, so the adapter builds a view-order-to-alphabetical index map by `fieldId` and remaps every row; every index downstream is a view index. The reader is always released in a `finally` block, and every read goes through a per-viz promise chain, because Tableau supports **only one active summary-data reader at a time** and a leaked one blocks the next read.
3. **Classify the columns.** Each column becomes a measure or a dimension — see [Supported Chart Types](#supported-chart-types).
4. **Decide the trace type and build the layer.** One worksheet produces exactly **one** MAIDR layer inside its own subplot; a dashboard of four worksheets is a four-row, one-column subplot grid.
5. **Mount.** A wrapper `<div>` is inserted before the viz element and a React root renders MAIDR into it. The viz element itself is never moved — `<tableau-viz>` is a custom element and re-parenting re-runs its `connectedCallback`, with undocumented consequences for the iframe.

### Highlighting

There is no overlay, and that is a consequence of the embedding surface rather than a gap. The marks live inside a cross-origin iframe, so their geometry is unreachable; a box drawn on the host page would be drawn from guessed coordinates.

Instead, as the reader moves, the adapter calls `selectMarksByValueAsync()` on the owning worksheet with the field values of the row under the cursor, using Tableau's `select-replace` update type. Tableau then highlights that mark with its own selection styling, exactly as a mouse click would. Leaving the figure, and disposing the binding, clears the selection so MAIDR never leaves a stale one behind in the workbook.

Three honest consequences:

- **A cell MAIDR invented has nothing to select.** A grouped bar chart is rectangularized so every series has the same categories (see [Supported Chart Types](#supported-chart-types)); a filler cell carries no criteria, and navigating onto it *clears* the selection rather than selecting a neighbouring mark.
- **A point cloud selects only what it can name exactly.** When MAIDR reports several points at once, the adapter emits a multi-value selection only if those points differ in exactly one field. Otherwise it clears — passing two fields with two values each selects the four-way cross product, not the two marks the reader is on.
- **A rejected selection disables selection for that layer permanently.** `selectMarksByValueAsync` throws on a field name or value it does not accept. The first rejection logs one console warning naming the worksheet and the field, clears the selection, and stops calling for that layer. Audio, text, braille, autoplay and review keep working — a chart that is readable but not highlighted is far better than one that throws on every keypress.

Selection is one-directional. Clicking a mark in Tableau does **not** move the MAIDR cursor; see [Limitations](#limitations).

## Installation

### CDN (script tags)

```html
<script
  type="module"
  src="https://public.tableau.com/javascripts/api/tableau.embedding.3.latest.min.js"
></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/tableau.js"></script>
<script type="module">
  // Global: maidrTableau
  document.getElementById('tableauViz').addEventListener('firstinteractive', (event) => {
    maidrTableau.bindTableau(event.target);
  });
</script>
```

`tableau.embedding.3.latest.min.js` is served from your own Tableau host — `public.tableau.com` for Tableau Public, `https://your-server/javascripts/api/…` for Tableau Server, `https://<pod>.online.tableau.com/javascripts/api/…` for Tableau Cloud. The version-pinned Tableau CDN build at `https://embedding.tableauusercontent.com/tableau.embedding.3.N.N.min.js` works too, and is the only one where the version is under your control.

Unlike the other MAIDR adapters, this one cannot be demonstrated from a `file://` URL, because the Embedding API refuses to load there.

### ESM (modern build tooling / bundlers)

```html
<script type="module">
  import { TableauEventType } from 'https://public.tableau.com/javascripts/api/tableau.embedding.3.latest.min.js';
  import { bindTableau } from 'https://cdn.jsdelivr.net/npm/maidr/dist/tableau.mjs';

  const viz = document.getElementById('tableauViz');
  viz.addEventListener(TableauEventType.FirstInteractive, () => bindTableau(viz));
</script>
```

### npm

```bash
npm install maidr
```

```ts
import type { TableauAdapterOptions } from 'maidr/tableau';
import { bindTableau } from 'maidr/tableau';

const binding = bindTableau(viz, { title: 'Regional sales' });
// later: binding?.dispose();
```

No `@tableau/*` package is required or installed. The adapter's Tableau types are its own minimal structural interfaces describing only the members it reads, which is what keeps it version-independent — and what lets the same extraction code serve a future Dashboard Extensions binder unchanged.

## Supported Chart Types

Tableau does not tell the Embedding API what mark type it drew. `getVisualSpecificationAsync()` — the call that reports the mark type, the shelves and the encodings — exists on the **Extensions** surface only. The adapter feature-detects it and uses it when it is there, but on the embedding surface today it is absent, so the chart type is read from the **shape of the summary data**.

Every column is first classified as a measure or a dimension:

| Column | Read as |
|---|---|
| `isReferenced: false` (a tooltip-only passenger) | dropped |
| `dataType` of `spatial` or `unknown` | dropped — nothing sonifiable |
| `SUM(Sales)`, `AVG(Profit)`, `CNTD(Order ID)`, … on a numeric type | **measure**, captioned `Sales`, `Profit`, `Order ID` |
| `YEAR(Order Date)`, `MONTH(Ship Date)`, `WEEKDAY(…)`, … | **dimension**, temporal |
| any other numeric column | **measure** |
| anything else | **dimension**, temporal when its type is a date |

The aggregation wrapper is matched by name, and Tableau documents `fieldName` as **not stable across languages** — a French workbook yields `SOMME(Ventes)`, which no wrapper list will match. That is why the numeric `dataType` is the backstop rather than the regex being the only test: such a column is still read as a measure, and the only thing that degrades is the caption, which keeps its wrapper. Nothing is ever assigned the wrong role because of a localized name.

With `D` the dimensions and `M` the measures, both in view order:

| Condition | MAIDR trace | Data shape |
|---|---|---|
| No measure at all | **worksheet skipped**, with a warning | — |
| No dimension at all | **worksheet skipped**, with a warning — a single aggregate has nothing to navigate | — |
| Two or more measures, and every dimension is a detail dimension (as many distinct values as there are rows) | **Scatter** (`point`) | flat points, `x` = first measure, `y` = second, `z` = third when present |
| The first dimension is temporal, or is an unaggregated numeric field | **Line** (`line`) | nested series, one per group; a missing sample is a `null` gap, never a zero |
| One dimension | **Bar** (`bar`) | flat points, one per row in view order |
| Two or more dimensions | **Dodged bar** (`dodged_bar`) | nested segments, grouped by the second dimension |

A third and further dimension is ignored, with one warning naming them. Grouping always uses the second dimension.

When a visual specification *is* available — inside a future Extensions binder, or a future Embedding release that adds the call — the mark type outranks the ladder above: `bar` reads as a bar or dodged bar, `line` as a line, `area` as an area, `pie` as a pie, `square`/`heatmap` as a heatmap when the grid is complete, and `circle`/`shape` as a scatter when there are two measures to put on the axes.

### What the adapter refuses to guess

Four readings are reachable only by declaring them (see [When The Heuristics Are Wrong](#when-the-heuristics-are-wrong)), and each refusal has a reason worth knowing:

- **Stacked versus side-by-side bars cannot be distinguished at all.** Tableau's summary data gives each segment's own value in both layouts; nothing in the numbers says whether they were drawn on top of one another or beside one another. `dodged_bar` is the default because it announces each group's own value and never claims a total the view may not have drawn. MAIDR's segmented trace appends its synthetic *Total* summary row either way, so the totals are still there for a stacked view — they are simply not asserted as the drawing.
- **A heatmap is never inferred.** Two dimensions and one measure is *equally* the signature of a highlight table and of a grouped bar chart. Reading it as a dodged bar announces exactly the same numbers, needs no complete grid, and does not silently reverse the y axis the way a heatmap layer does.
- **Normalized and 100%-stacked readings are never inferred**, for the same reason as the stacking above.
- **Box plots, histograms, gantt charts, treemaps and choropleths are skipped, not approximated.** Tableau's summary data for a box plot is the disaggregated marks, not the quartiles — a quartile MAIDR computed itself is not the quartile Tableau drew. A gantt needs a start and an end, which the summary reports as a duration measure. A choropleth needs centroid latitude/longitude and a neighbour list, which the API does not expose. In every case a wrong reading is worse than no reading, so those worksheets contribute nothing and warn.

A worksheet that yields no layer contributes **no subplot**, so a skipped worksheet never shifts the numbering of the ones that survive. If *every* worksheet is skipped, `bindTableau` warns once, mounts nothing, and returns `null`, leaving the page exactly as it was.

## When The Heuristics Are Wrong

Everything above can be overridden per worksheet, by name, through the options object. There is one configuration channel and it is plain JavaScript — the Embedding API exposes no settings store, and a second channel before a second host exists would be an abstraction with one caller.

```js
maidrTableau.bindTableau(viz, {
  title: 'Regional performance',
  worksheets: ['Sales by Region', 'Trend'],   // include-list, honoured in this order
  overrides: {
    'Sales by Region': {
      traceType: 'stacked_bar',               // the data cannot reveal this — say so
      x: 'Region',                            // Column.fieldName, or fieldId
      y: 'SUM(Sales)',
      z: 'Segment',
      axes: { x: 'Region', y: 'Sales (USD)', z: 'Customer segment' },
    },
    'Trend': { title: 'Sales over time', orientation: 'vertical' },
    'Scratch sheet': { skip: true },
  },
});
```

Three rules govern how an override is honoured:

- **Precedence.** `overrides[name].traceType` outranks the visual specification, which outranks the heuristic ladder.
- **A name that resolves to nothing degrades rather than throws.** `x` / `y` / `z` are matched against `Column.fieldName` first and `Column.fieldId` second. An unmatched name logs one warning that lists the columns the worksheet actually has, and the heuristic pick is used instead.
- **An override that cannot be honoured degrades too.** `traceType: 'heat'` on a worksheet whose grid is incomplete falls back to the ladder's answer and warns. A truthful smaller reading, never a confident wrong one.

Two things the summary data never reveals, and which therefore have no default:

- **`orientation`** — nothing says whether Tableau drew the bars horizontally, so the field is emitted only when you set it.
- **`stepDirection`** — likewise for a step chart's convention.

## Refresh and Filters

The binder listens on the `<tableau-viz>` element, which is an ordinary DOM `EventTarget` (the Tableau payload arrives in `event.detail`):

| Event | String | Why it matters |
|---|---|---|
| `FirstInteractive` | `firstinteractive` | the gate — nothing is readable before it |
| `FilterChanged` | `filterchanged` | quick filters and dashboard actions change the rows |
| `ParameterChanged` | `parameterchanged` | a parameter control can reshape the whole view |
| `SummaryDataChanged` | `summarydatachanged` | a data source refresh or extract update |

All three change events funnel into a single **trailing-debounced** re-read, 250 ms after the last one, because one dashboard filter fires several events across several worksheets and only one re-read is wanted. Each re-read clears the mark selection first, so MAIDR's own selection cannot bias the data that comes back, then re-reads every bound worksheet through the same one-reader-at-a-time chain and rebuilds the figure. A refresh that throws is logged and **leaves the previous figure mounted** — a stale but correct figure beats a dead one.

**By default the refresh is not applied while the reader is inside the chart.** It is stored and picked up on the next focus-in, which is far less disruptive than rebuilding the figure under someone who is mid-navigation, and it means an idle dashboard on an auto-refreshing extract never interrupts anyone. Pass `live: true` to opt into in-place updating with cursor preservation instead:

```js
maidrTableau.bindTableau(viz, { live: true });
```

The figure's id is captured once at bind time and reused across every refresh, so the same MAIDR instance is updated rather than replaced.

## API Reference

### `bindTableau(viz, options?)`

Mounts MAIDR beside a `<tableau-viz>` element. Call it after the viz has fired `firstinteractive`.

| Parameter | Type | Description |
|---|---|---|
| `viz` | `TableauViz` | The live `<tableau-viz>` element (`document.getElementById(...)`, or `event.target` in a `firstinteractive` handler). |
| `options` | `TableauAdapterOptions?` | Everything below. |

Returns a binding handle whose `dispose()` unregisters every listener, cancels the pending debounce, clears each bound worksheet's mark selection, unmounts the React root and removes the wrapper element. Returns **`null`** when no worksheet produced a layer — the page is left untouched, so always null-check before calling `dispose()`.

### `TableauAdapterOptions`

| Option | Type | Description |
|---|---|---|
| `id` | `string?` | Stable figure id, kept across refreshes. Defaults to `maidr-tableau-<n>`. |
| `title` | `string?` | Figure title announced for the whole view. |
| `live` | `boolean?` | Apply refreshes in place while the reader is inside the chart. Default `false` — see [Refresh and Filters](#refresh-and-filters). |
| `worksheets` | `string[]?` | Worksheet names to include, honoured in the order written. Default: every worksheet of the active sheet. |
| `overrides` | `Record<string, TableauWorksheetOverride>?` | Per-worksheet configuration, keyed by worksheet name. |
| `anchorLabel` | `string?` | Text on the keyboard entry point rendered beside the viz. Defaults to `Accessible chart view — press Enter, then use arrow keys`. Style it with the `[data-maidr-tableau-anchor]` attribute selector. |

Every field is JSON-serializable by design, so the same object can be stored and parsed back by a future Dashboard Extensions binder.

### `TableauWorksheetOverride`

| Option | Type | Description |
|---|---|---|
| `skip` | `boolean?` | Leave this worksheet out of the figure entirely. |
| `traceType` | `TraceType?` | Force the reading. Outranks both the visual specification and the ladder; falls back with a warning if it cannot be honoured. |
| `title` | `string?` | Layer title. Defaults to the worksheet name. |
| `x` | `string?` | `Column.fieldName` (or `fieldId`) to use as the category / x axis. |
| `y` | `string?` | The measure to use as the value. |
| `z` | `string?` | The dimension to group series by. |
| `orientation` | `Orientation?` | Emitted only when set — the summary data does not reveal it. |
| `stepDirection` | `StepDirection?` | Emitted only when set, for a step reading. |
| `axes` | `{ x?: string; y?: string; z?: string }?` | Axis labels. Default to the resolved columns' captions. |

### `extractTableau(snapshots, options?)`

The pure half of the adapter: it takes the worksheet snapshots the reader produced and returns `{ maidr, selection }` — the MAIDR schema, plus the map from every navigable position back to the Tableau selection criteria that address it. No DOM, no React, no `await`, and the returned `maidr` carries no `onNavigate` (the binder attaches that). Exported for tooling and tests; a page that just wants an accessible chart wants `bindTableau`.

### Type exports

```ts
import type {
  TableauAdapterOptions,
  TableauColumn,
  TableauSelectionCriteria,
  TableauViz,
  TableauWorksheet,
  TableauWorksheetOverride,
} from 'maidr/tableau';
```

These are **minimal structural types** describing only the subset of the Tableau API the adapter actually reads. Nothing here depends on a `@tableau/*` package.

## Keyboard Controls

Once the figure is focused, the standard MAIDR shortcuts apply:

| Function | Key (Windows) | Key (Mac) |
|----------|--------------|-----------|
| Move between data points | Arrow keys | Arrow keys |
| Go to extremes | Ctrl + Arrow | Cmd + Arrow |
| Move between worksheets (subplots) | Page Up / Page Down | Page Up / Page Down |
| Toggle Sonification | S | S |
| Toggle Braille Mode | B | B |
| Toggle Text Mode | T | T |
| Toggle Review Mode | R | R |
| Auto-play | Ctrl + Shift + Arrow | Cmd + Shift + Arrow |
| Stop Auto-play | Ctrl | Cmd |

For the full list, see the [Keyboard Controls](CONTROLS.html) reference.

## Limitations

Stated plainly, because every one of these is a place where a plausible-looking feature would have had to be guessed:

- **No highlight overlay.** The marks are inside a cross-origin iframe. The only visual feedback is Tableau's own mark selection, described under [How It Works](#how-it-works).
- **Selection is one-directional.** Clicking a mark in the Tableau view does not move the MAIDR cursor. The API gives no way to tell a programmatic selection from a user one, and a mark carries no stable id, so the reverse lookup would have to reconstruct a position from field values and would be ambiguous wherever two rows share them.
- **Stacked and side-by-side bars are indistinguishable**, as are normalized ones. Set `overrides[name].traceType` to say which it is.
- **Box plots, histograms, gantt charts, treemaps and choropleths are skipped**, with a warning, rather than approximated. See [Supported Chart Types](#supported-chart-types).
- **Story sheets are skipped.** The Embedding API has a listed known issue: a worksheet inside a story throws *operation not allowed on non-active sheet*.
- **A dashboard becomes an N×1 subplot column**, in the order the worksheets were added to the dashboard — the order Tableau documents a screen reader as narrating them. Geometry-aware two-dimensional layout is not attempted, because the Embedding API's dashboard objects are not documented to carry position and size.
- **Summary data only.** Underlying data (`getUnderlyingTableDataReaderAsync`) is gated to Explorer and Creator roles and would fail silently for Viewer-role users, so it is never requested.
- **Nothing is written back into the workbook.** No annotations, no filters, no parameter changes; the only write is the mark selection, which is cleared on blur and on dispose.
- **Authentication is the host page's job.** Tableau Public needs none. Tableau Cloud and Tableau Server do: a connected-app JWT must be minted **by your server** — the connected-app secret must never reach the browser — and handed to the component through the `token` attribute or `viz.token` before you bind. The adapter neither mints, refreshes, nor inspects a token.
- **Dashboard extensions are a separate surface.** Running MAIDR *inside* a Tableau dashboard requires a `.trex` manifest, a hosted origin, and per-site admin safe-listing for anything network-enabled. The extraction code here is written against structural interfaces both surfaces satisfy, so that binder is future work rather than a rewrite — but it is not in this release.

A runnable page is at [tableau-bar.html](examples/tableau-bar.html); remember that it must be served over `http(s)` and needs a live connection to Tableau Public.

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
