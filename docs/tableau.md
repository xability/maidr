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
- **Keyboard navigation** — arrow keys through data points; <kbd>Escape</kbd> back out to the worksheet list, <kbd>Up</kbd>/<kbd>Down</kbd> to choose another worksheet, <kbd>Enter</kbd> to open it
- **Mark selection** — the mark under the cursor is selected in the Tableau view itself, which is what a sighted colleague sees highlight

A dashboard of several worksheets opens in MAIDR's *subplot lobby* rather than inside a chart: on activation MAIDR announces how many subplots the figure has and tells you to use the arrow keys and <kbd>Enter</kbd>. See [Keyboard Controls](#keyboard-controls) for the exact keys.

Two hosting notes, both from Tableau's own documentation:

- **The page must be served over `http(s)`, not opened from `file://`.** The Embedding API is an ES module; loading it from the file system fails CORS with `Access to script at 'file:///…' from origin 'null' has been blocked`. Any static server (`npx serve`, `python3 -m http.server`) is enough — no application server is involved.
- **Tableau Public views need no authentication.** Tableau Cloud and Tableau Server do; see [Limitations](#limitations).

## How It Works

The adapter never imports a Tableau package. It duck-types the live `<tableau-viz>` element the page already created, so it stays independent of the Embedding library's version.

1. **Find the worksheets.** `viz.workbook.activeSheet` is read at bind time, and again on every refresh — a `tabswitched` event changes which sheet the worksheets come from. A `worksheet` sheet is a single worksheet; a `dashboard` contributes `dashboard.worksheets`, in the order the author added them — which is also the order Tableau's own documentation says a screen reader narrates a dashboard. A `story` sheet is skipped with a warning (see [Limitations](#limitations)).
2. **Read the summary data.** For each worksheet the adapter calls `getSummaryColumnsInfoAsync()` for the columns *in view order*, then opens a `getSummaryDataReaderAsync()` and pages through it. The reader hands its columns back **alphabetically**, so the adapter builds a view-order-to-alphabetical index map by `fieldId` and remaps every row; every index downstream is a view index. The reader is always released in a `finally` block, and every read goes through a per-viz promise chain, because Tableau supports **only one active summary-data reader at a time** and a leaked one blocks the next read.
3. **Classify the columns.** Each column becomes a measure or a dimension — see [Supported Chart Types](#supported-chart-types).
4. **Decide the trace type and build the layer.** One worksheet produces exactly **one** MAIDR layer inside its own subplot; a dashboard of four worksheets is a four-row, one-column subplot grid.
5. **Mount.** A wrapper `<div>` is inserted before the viz element and a React root renders MAIDR into it. The viz element itself is never moved — `<tableau-viz>` is a custom element and re-parenting re-runs its `connectedCallback`, with undocumented consequences for the iframe.

### Highlighting

There is no overlay, and that is a consequence of the embedding surface rather than a gap. The marks live inside a cross-origin iframe, so their geometry is unreachable; a box drawn on the host page would be drawn from guessed coordinates.

Instead, as the reader moves, the adapter calls `selectMarksByValueAsync()` on the owning worksheet with the field values of the row under the cursor, using Tableau's `select-replace` update type. Tableau then highlights that mark with its own selection styling, exactly as a mouse click would.

The selection is cleared again in three places, so a highlight never outlives the cursor that put it there:

- **When focus leaves MAIDR's block.** The adapter listens for `focusout` on its own wrapper and, one task later, re-checks whether the focused element is still inside it — the same test MAIDR's controller uses to decide a reading session has ended. Tabbing on into the Tableau iframe, or away to the rest of the page, clears every bound worksheet. The adapter has to do this itself: disposing the controller notifies nothing, so without the listener the mark would stay highlighted in the workbook with nothing explaining why.
- **Before every re-read.** A filter or parameter change clears first, so MAIDR's own selection cannot bias the data that comes back.
- **On `dispose()`.** Every bound worksheet is cleared as the binding is torn down.

Three honest consequences:

- **A cell MAIDR invented has nothing to select.** A grouped bar chart is rectangularized so every series has the same categories (see [Supported Chart Types](#supported-chart-types)); a filler cell carries no criteria, and navigating onto it *clears* the selection rather than selecting a neighbouring mark.
- **A point cloud selects only what it can name exactly.** When MAIDR reports several points at once, the adapter emits a multi-value selection only if those points differ in exactly one field. Otherwise it clears — passing two fields with two values each selects the four-way cross product, not the two marks the reader is on.
- **A rejected selection disables selection for that worksheet permanently.** `selectMarksByValueAsync` throws on a field name or value it does not accept. The first rejection logs one console warning naming the worksheet and the field, clears the selection, and stops calling for that worksheet. The latch is keyed by worksheet *name*, not by layer id, because a refresh that drops a worksheet renumbers the ids after it. Audio, text, braille, autoplay and review keep working — a chart that is readable but not highlighted is far better than one that throws on every keypress.

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

const options: TableauAdapterOptions = { title: 'Regional sales' };

// `bindTableau` is async — it can only tell you whether any worksheet produced
// a navigable layer after the first read has finished. Top-level `await` is
// valid in an ES module, so no wrapping IIFE is needed.
const binding = await bindTableau(viz, options);
// later: binding?.dispose();
```

No `@tableau/*` package is required or installed. The adapter's Tableau types are its own structural interfaces, which is what keeps it version-independent — and what lets the same extraction code serve a future Dashboard Extensions binder unchanged. They describe only the members it reads, with one exception: the visual specification is mirrored whole, member for member, against the declarations shipped in `@tableau/embedding-api@3.12.1`, and each of those types names the file it was read from so it can be re-verified against the package rather than against prose.

## Supported Chart Types

`getVisualSpecificationAsync()` — the call that reports the mark type, the shelves and the encodings — is declared on **both** public `Worksheet` interfaces, Embedding and Extensions, and is implemented by the Embedding API's own `Worksheet` class. When the page has loaded a library build that has it, the adapter uses it and the mark type settles the chart type.

The adapter still **feature-detects** the call rather than assuming it, because the declaration describes the contract and not the host: the page loads whichever build of the Embedding library it chooses, and an older one predates the method. (A current library talking to an older Tableau Server can also have the method and be refused at runtime; that is caught and treated the same way.) When there is no specification, the chart type is read from the **shape of the summary data** instead.

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

With `D` the dimensions and `M` the measures, both in view order, the rungs are tried **in this order** — and the order is load-bearing:

| Condition | MAIDR trace | Data shape |
|---|---|---|
| No measure at all | **worksheet skipped**, with a warning | — |
| Two or more measures, and every dimension is a detail dimension (as many distinct values as there are rows) | **Scatter** (`point`) | flat points, `x` = first measure, `y` = second, `z` = third when present |
| No dimension at all | **worksheet skipped**, with a warning — a single aggregate has nothing to navigate | — |
| The first dimension is temporal | **Line** (`line`) | nested series, one per group; a missing sample is a `null` gap, never a zero |
| One dimension | **Bar** (`bar`) | flat points, one per row in view order |
| Two or more dimensions | **Dodged bar** (`dodged_bar`) | nested segments, grouped by the second dimension |

The scatter rung is tested **before** the "no dimension" skip on purpose. A worksheet with a continuous field on an axis — an unaggregated `Discount`, or a `Sales (bin)` field — has that field classified as a second *measure*, because every numeric column goes to the measure rung above. Such a worksheet reaches the ladder with no dimensions at all, where "every dimension is a detail dimension" is vacuously true, and numeric-x-against-numeric-y is exactly what it is. Tested the other way round, a perfectly readable view would vanish from the figure.

For the same reason the line rung asks only whether the first dimension is *temporal*: a continuous numeric field never arrives as a dimension, so a date-part wrapper such as `YEAR(Order Date)` is the only dimension that can be numeric, and it is already temporal.

A third and further dimension is ignored, with one warning naming them. Grouping always uses the second dimension.

When a visual specification *is* available, the mark type outranks the ladder above: `bar` reads as a bar or dodged bar, `line` as a line, `area` as an area, `pie` as a pie, `square`/`heatmap` as a heatmap when the grid is complete, and `circle`/`shape` as a scatter when there are two measures to put on the axes. Those are eight of the thirteen mark types Tableau declares; the other five are refused — see [Box plots, histograms, gantt charts, treemaps and choropleths](#box-plots-histograms-gantt-charts-treemaps-and-choropleths). A mark type from a later Tableau than this list knows about falls through to the ladder rather than being guessed at.

A dual-axis worksheet reports one marks card per measure. Only the active card is read, and a warning names how many there were: nothing in the API says which axis a card belongs to, or which summary-data column came from it, so merging them into one figure would be invention.

### What the adapter refuses to guess

Three readings are reachable only by declaring them (see [When The Heuristics Are Wrong](#when-the-heuristics-are-wrong)), and each refusal has a reason worth knowing:

- **Stacked versus side-by-side bars is not something the API reports.** Tableau's summary data gives each segment's own value in both layouts; nothing in the numbers says whether they were drawn on top of one another or beside one another, and no property anywhere in the public contract reports Tableau's *Stack Marks* setting. The visual specification does carry the shelves and the encodings, so the layout is not entirely unevidenced — but inferring it from where a field sits would be a claim about Tableau's authoring habits, not a reading of a declared fact, and the adapter does not make it. `dodged_bar` is the default because it announces each group's own value and never claims a total the view may not have drawn. MAIDR's segmented trace appends its synthetic *Total* summary row either way, so the totals are still there for a stacked view — they are simply not asserted as the drawing.
- **A heatmap is never inferred.** Two dimensions and one measure is *equally* the signature of a highlight table and of a grouped bar chart. Reading it as a dodged bar announces exactly the same numbers, needs no complete grid, and does not silently reverse the y axis the way a heatmap layer does.
- **Normalized and 100%-stacked readings are never inferred**, for the same reason as the stacking above.

### Box plots, histograms, gantt charts, treemaps and choropleths

None of these are ever *inferred as themselves*, and the reasons are real: Tableau's summary data for a box plot is the disaggregated marks, not the quartiles, and a quartile MAIDR computed itself is not the quartile Tableau drew; a gantt needs a start and an end, which the summary reports as a duration measure; a choropleth needs centroid latitude/longitude and a neighbour list the API does not expose. Nothing in a table of numbers says which of these the author drew.

What happens instead splits two ways, and the split is by mark type rather than by API surface:

- **Refused outright**, with a warning and no layer, when the visual specification says the marks are `gantt-bar`, `text`, `map`, `polygon` or `viz-extension`. So a gantt chart and a choropleth are skipped rather than mis-announced, on the embedding surface as much as the extensions one.
- **Read as something else**, because the mark type is one MAIDR does support and the primitive alone cannot separate the two uses. A treemap draws `square` marks, which read as a heatmap on a complete grid and otherwise fall to the ladder; a histogram draws `bar` marks, which read as a bar chart; a box plot draws `circle` marks, which read as a scatter when there are two measures and otherwise fall to the ladder, where its disaggregated marks become one bar per underlying record with the category label repeated. These readings are produced **without a warning**, because nothing detectable went wrong. The reading will be wrong, and MAIDR has no way to know it.

When the host's library build has no `getVisualSpecificationAsync` at all, the first group loses its refusal too and every one of these views falls to the ladder unwarned.

**The remedy is to name the worksheet.** Set `overrides['<worksheet>'].skip = true` to leave a distribution or a geographic view out of the figure, or `overrides['<worksheet>'].traceType` to declare what it really is — see [When The Heuristics Are Wrong](#when-the-heuristics-are-wrong).

A worksheet that yields no layer contributes **no subplot**, so a skipped worksheet never shifts the numbering of the ones that survive. If *every* worksheet is skipped, `bindTableau` warns once, mounts nothing, and resolves to `null`, leaving the page exactly as it was.

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
      orientation: 'horz',                    // 'horz' or 'vert' — the summary
                                              // data cannot reveal which
      // A horizontal bar puts the magnitude on x and the category on y, and an
      // explicit caption names the axis as the layer emits it.
      axes: { x: 'Sales (USD)', y: 'Region', z: 'Customer segment' },
    },
    'Trend': { title: 'Sales over time' },
    'Scratch sheet': { skip: true },
  },
});
```

Three rules govern how an override is honoured:

- **Precedence.** `overrides[name].traceType` outranks the visual specification, which outranks the heuristic ladder.
- **A name that resolves to nothing degrades rather than throws.** `x` / `y` / `z` are matched against `Column.fieldName` first and `Column.fieldId` second. An unmatched name logs one warning that lists the columns the worksheet actually has, and the heuristic pick is used instead.
- **An override that cannot be honoured degrades too.** `traceType: 'heat'` on a worksheet whose grid is incomplete falls back to the ladder's answer and warns. A truthful smaller reading, never a confident wrong one.

Two things the summary data never reveals, and which therefore have no default:

- **`orientation`** — `'horz'` or `'vert'`, the grammar's own values rather than the words they abbreviate. Read only by the bar family; a line, scatter, heatmap or pie layer ignores it. Nothing in the summary data says whether Tableau drew the bars horizontally, so the field is emitted only when you set it. Setting `'horz'` transposes the payload the adapter builds — magnitude on `x`, category on `y`, which is what MAIDR's bar model reads for an oriented layer — and swaps the default axis captions with it, so an explicit `axes` caption still names the axis it is written for. A value outside those two strings is not the same as leaving it unset: the model compares it against `'vert'` and treats anything else as horizontal, so the payload and the flag disagree and every bar sonifies as a non-number.
- **`stepDirection`** — likewise for a step chart's convention: `'hv'`, `'vh'` or `'mid'`.

## Refresh and Filters

The binder listens on the `<tableau-viz>` element, which is an ordinary DOM `EventTarget` (the Tableau payload arrives in `event.detail`):

| Event | String | Why it matters |
|---|---|---|
| `FirstInteractive` | `firstinteractive` | the gate — nothing is readable before it |
| `FilterChanged` | `filterchanged` | quick filters and dashboard actions change the rows |
| `ParameterChanged` | `parameterchanged` | a parameter control can reshape the whole view |
| `SummaryDataChanged` | `summarydatachanged` | a data source refresh or extract update |
| `TabSwitched` | `tabswitched` | the active sheet changed, so which worksheets exist changed too |

All four change events funnel into a single **trailing-debounced** re-read, 250 ms after the last one, because one dashboard filter fires several events across several worksheets and only one re-read is wanted. Each re-read re-discovers the worksheets from the active sheet (`tabswitched` arrives on the same path and can change which sheet they come from), clears the mark selection first so MAIDR's own selection cannot bias the data that comes back, then re-reads every bound worksheet through the same one-reader-at-a-time chain and rebuilds the figure. A refresh that throws is logged and **leaves the previous figure mounted** — a stale but correct figure beats a dead one.

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

**Returns `Promise<TableauBinding | null>` — `await` it.** The call is asynchronous by necessity: whether any worksheet yields a navigable layer is only knowable once the first read has finished. It resolves to **`null`** when no worksheet produced a layer, in which case the page is left exactly as it was found and there is nothing to tab to. Null-check the **awaited** value, never the call itself: a promise is always truthy, so `bindTableau(viz)?.dispose()` neither short-circuits nor works — it throws `TypeError: binding.dispose is not a function`.

The resolved handle carries three members:

| Member | Type | Description |
|---|---|---|
| `maidr` | `Maidr` | Getter for the MAIDR data currently mounted, including the `onNavigate` callback. A getter rather than a snapshot, because every successful refresh replaces the object wholesale. |
| `refresh` | `() => Promise<void>` | Re-read every bound worksheet and re-render, on demand. Never rejects: a read failure is logged and the previously mounted figure is left in place. Calls are serialized behind any refresh already running. |
| `dispose` | `() => void` | Unregisters every listener, cancels the pending debounce, clears each bound worksheet's mark selection, unmounts the React root and removes the wrapper element. The `<tableau-viz>` element is left exactly as it was found. |

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
| `orientation` | `Orientation?` — `'horz'` or `'vert'` | Emitted only when set — the summary data does not reveal it. Read only by the bar family. Any other string is treated as horizontal by the model, not ignored. |
| `stepDirection` | `StepDirection?` — `'hv'`, `'vh'` or `'mid'` | Emitted only when set, for a step reading. |
| `axes` | `{ x?: string; y?: string; z?: string }?` | Axis labels. Default to the resolved columns' captions — swapped along with the payload on a horizontal bar layer. An explicit caption always wins, and names the axis as the layer emits it. |

### `extractTableau(snapshots, options?)`

The pure half of the adapter: it takes the worksheet snapshots the reader produced and returns a `TableauExtraction` — `{ maidr, selection }`, the MAIDR schema plus a `SelectionIndex` mapping every navigable position back to the Tableau selection criteria that address it (`cells` for grid positions, `points` for point clouds, and `worksheets` for which worksheet each layer id came from). Synchronous: no DOM, no React, no `await`. The returned `maidr` carries no `onNavigate` — the binder attaches that. Exported for tooling and tests; a page that just wants an accessible chart wants `bindTableau`.

### Type exports

```ts
import type {
  SelectionIndex,
  TableauAdapterOptions,
  TableauBinding,
  TableauColumn,
  TableauDataType,
  TableauExtraction,
  TableauSelectionCriteria,
  TableauViz,
  TableauWorksheet,
  TableauWorksheetOverride,
  WorksheetSnapshot,
} from 'maidr/tableau';
```

These are **minimal structural types** describing only the subset of the Tableau API the adapter actually reads. Nothing here depends on a `@tableau/*` package.

## Keyboard Controls

Once the figure is focused, the standard MAIDR shortcuts apply:

| Function | Key (Windows) | Key (Mac) |
|----------|--------------|-----------|
| Move between data points | Arrow keys | Arrow keys |
| Go to extremes | Ctrl + Arrow | Cmd + Arrow |
| Leave a worksheet for the dashboard's worksheet list | Escape (or Backspace) | Escape (or Delete) |
| Move between worksheets in that list | Up / Down arrows | Up / Down arrows |
| Open the selected worksheet | Enter | Enter |
| Toggle Sonification | S | S |
| Toggle Braille Mode | B | B |
| Toggle Text Mode | T | T |
| Toggle Review Mode | R | R |
| Auto-play | Ctrl + Shift + Arrow | Cmd + Shift + Arrow |
| Stop Auto-play | Ctrl | Cmd |

Two notes specific to this adapter:

- **Up and Down, not Left and Right, move between worksheets.** A dashboard becomes an N×1 subplot column (see [Limitations](#limitations)), so Left and Right in the worksheet list are always out of bounds.
- **<kbd>Page Up</kbd> and <kbd>Page Down</kbd> do nothing here.** Those keys switch between *layers* of one subplot, and a Tableau worksheet always produces exactly one layer. There is nothing for them to switch to.

For the full list, see the [Keyboard Controls](CONTROLS.html) reference.

## Limitations

Stated plainly, because every one of these is a place where a plausible-looking feature would have had to be guessed:

- **No highlight overlay.** The marks are inside a cross-origin iframe. The only visual feedback is Tableau's own mark selection, described under [How It Works](#how-it-works).
- **Selection is one-directional.** Clicking a mark in the Tableau view does not move the MAIDR cursor. The API gives no way to tell a programmatic selection from a user one, and a mark carries no stable id, so the reverse lookup would have to reconstruct a position from field values and would be ambiguous wherever two rows share them.
- **Stacked and side-by-side bars are not told apart**, and neither are normalized ones. No property in Tableau's public contract reports the *Stack Marks* setting, and the adapter will not infer the layout from where a field sits on the shelves. Set `overrides[name].traceType` to say which it is.
- **Box plots, histograms and treemaps are never inferred as themselves, and are not skipped either.** Their mark primitives — `circle`, `bar`, `square` — are the same ones a scatter, a bar chart and a heatmap are drawn with, so the mark type cannot separate them and they are announced as those instead, with no warning. (Gantt charts and choropleths *are* skipped: `gantt-bar` and `map` are theirs alone.) Exclude a view by name with `overrides['<worksheet>'].skip`, or declare what it is with `overrides['<worksheet>'].traceType`. See [Supported Chart Types](#supported-chart-types).
- **A dual-axis worksheet is read as one of its axes.** Tableau reports a marks card per measure but nothing that says which axis a card belongs to, whether the axes are synchronized, or which summary-data column came from which card. The active card is read and the others are named in a warning.
- **Story sheets are skipped.** The Embedding API has a listed known issue: a worksheet inside a story throws *operation not allowed on non-active sheet*.
- **A dashboard becomes an N×1 subplot column**, in the order the worksheets were added to the dashboard — the order Tableau documents a screen reader as narrating them. Geometry-aware two-dimensional layout is not attempted, because the Embedding API's dashboard objects are not documented to carry position and size.
- **Summary data only.** Underlying data (`getUnderlyingTableDataReaderAsync`) is gated to Explorer and Creator roles and would fail silently for Viewer-role users, so it is never requested.
- **Nothing is written back into the workbook.** No annotations, no filters, no parameter changes; the only write is the mark selection, and that is cleared when focus leaves MAIDR's block, before every re-read, and on `dispose()` — see [How It Works](#how-it-works).
- **Authentication is the host page's job.** Tableau Public needs none. Tableau Cloud and Tableau Server do: a connected-app JWT must be minted **by your server** — the connected-app secret must never reach the browser — and handed to the component through the `token` attribute or `viz.token` before you bind. The adapter neither mints, refreshes, nor inspects a token.
- **Dashboard extensions are a separate surface.** Running MAIDR *inside* a Tableau dashboard requires a `.trex` manifest, a hosted origin, and per-site admin safe-listing for anything network-enabled. The extraction code here is written against structural interfaces both surfaces satisfy, so that binder is future work rather than a rewrite — but it is not in this release.

A runnable page is at [tableau-bar.html](examples/tableau-bar.html); remember that it must be served over `http(s)` and needs a live connection to Tableau Public.

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
