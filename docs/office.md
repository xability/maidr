# PowerPoint and Word Integration

MAIDR's Office adapter reads the charts of a PowerPoint presentation or a Word document in an [Office Add-in](https://learn.microsoft.com/office/dev/add-ins/overview/office-add-ins)'s task pane, and mounts MAIDR's accessible layer for them there: audio sonification, text descriptions, braille output, keyboard navigation and a description modal. One call does it for every Office application an add-in runs in: `bindOffice(element)` mounts the [Excel adapter](excel.md)'s pane in Excel, and this adapter's in PowerPoint and in Word.

Office.js has no way to read a chart in PowerPoint or Word. The adapter reads the file instead: PowerPoint hands an add-in its presentation as the file it would save, and Word hands over its body as Open XML. A chart in either is a DrawingML chart part, the same format as an Excel chart, holding a copy of each series' values as they were drawn. The adapter reads that copy into the snapshot the Excel adapter converts, so every chart type the Excel adapter reads is read here too.

> **What this adapter is not.** It does **not** make PowerPoint's or Word's own chart accessible where it sits on the slide or the page. The reading is in the task pane, and the reader moves to the pane to hear it. The pane shows no picture of the chart either: neither application hands one to an add-in, and the chart is on the slide or the page beside the pane. See [Limitations](#limitations) before you plan around it.

## Quick Start

An add-in is a web page an Office application opens in a task pane, and a manifest that tells it where the page is. Microsoft's [PowerPoint](https://learn.microsoft.com/office/dev/add-ins/quickstarts/powerpoint-quickstart-yo) and [Word](https://learn.microsoft.com/office/dev/add-ins/quickstarts/word-quickstart-yo) quick starts cover creating and sideloading one; MAIDR needs only the page below.

### 1. The task pane page

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Accessible charts</title>
    <script src="https://officeapis.public.onecdn.static.microsoft/1/office.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/office.js"></script>
  </head>
  <body>
    <main id="maidr" aria-label="Accessible charts"></main>
    <script>
      Office.onReady(() => {
        maidrOffice.bindOffice(document.getElementById('maidr'));
      });
    </script>
  </body>
</html>
```

`bindOffice` waits for `Office.onReady` as well, and asks it which application the page is open in: Excel, PowerPoint or Word. It appends one wrapper `<div>` to the element and changes nothing else. It resolves once the first chart has been read, and it never rejects: anything that stops it reading is said in the pane. An add-in for one application can call `bindPowerPoint(element)` or `bindWord(element)` directly instead.

A task pane built with a bundler imports the adapter. It is an ES module with React bundled in, and the Excel adapter with it, since `bindOffice` mounts Excel's pane in Excel:

```bash
npm install maidr
```

```ts
import { bindOffice } from 'maidr/office';

Office.onReady(() => bindOffice(document.getElementById('maidr')!));
```

### 2. The manifest

List every application the add-in runs in under `Hosts` — `Workbook` for Excel, `Presentation` for PowerPoint, `Document` for Word — and declare `ReadWriteDocument` permission, although the adapter writes nothing: Office requires it of any add-in that uses the Excel, PowerPoint or Word JavaScript API, [even one that only reads](https://learn.microsoft.com/office/dev/add-ins/develop/requesting-permissions-for-api-use-in-content-and-task-pane-add-ins).

```xml
<Hosts>
  <Host Name="Workbook" />
  <Host Name="Presentation" />
  <Host Name="Document" />
</Hosts>
<Permissions>ReadWriteDocument</Permissions>
```

Declare no requirement set the adapter needs, for the reason the [Excel guide](excel.md#2-the-manifest) gives: an add-in left out of an older Office application is one its reader never finds, while one that opens there says in its pane why it cannot read. What each application needs is under [How the Chart Is Read](#how-the-chart-is-read).

## How It Works

The pane holds a native `<select>` labelled **Chart**, listing every chart of the file, then the figure area, then a **Read again** button. In a presentation the charts are listed slide by slide, as `Slide 3: Sales by region`, a hidden slide's as `Slide 4 (hidden): …`; in a document, in reading order, as `Chart 2: Sales by region`. A chart is named by the title it shows, or else by the alternative text its author gave it, or else by its name on the slide or page (`Chart 3`). A keyboard or screen-reader user chooses a chart from the picker, then presses <kbd>Tab</kbd> to reach MAIDR's figure and reads it with the [usual keys](#keyboard).

The pane follows the file:

- **The chart the user selects is shown**, and the picker follows it. With nothing selected when the pane opens, the first chart is shown. In PowerPoint, the selected shape is matched against the charts read, by its slide and its id or name; a chart added since the file was read makes the pane read the file again. In Word, the selected chart is read from the selection itself, so it is read as it is now, edits included. Pass `followSelection: false` to leave the choice to the picker.
- **A selection that is not a chart changes nothing**, and neither does moving into the pane.
- **Read again** reads the whole file again and shows the chart on show again, or the first. PowerPoint and Word do not tell an add-in when a chart's data is edited, so this is how an edited chart is read again — or, in Word, by selecting it. A polite status line (`role="status"`) beside the button says when a read is under way and how many charts it found.

When there is nothing to read, the pane says why in a status message (`role="status"`, focusable with <kbd>Tab</kbd>) where the figure would be: a file with no charts, a chart whose every value is blank, a chart type MAIDR does not know, a chart whose data cannot be read, a PowerPoint or Word too old to hand its file to add-ins, or a page that is not running in Office at all. If the reader was in the figure when it gave way to a message, focus moves to the message, so they hear why the chart went. A combo chart read without one of its series has a note above the figure naming what was left out.

## Supported Chart Types

Every chart type the [Excel adapter reads](excel.md#supported-chart-types), with the same MAIDR layers: column, bar, line, pie, doughnut, pie of pie, bar of pie, scatter, bubble, area, radar, stock, surface and contour charts, and the chart types Office 2016 added — histogram, Pareto, box and whisker, waterfall, funnel, treemap, sunburst and map. A chart part's group (`c:barChart`, `c:lineChart`, and so on), grouping, direction and style are read into the `Excel.ChartType` Excel would report, and the chart is converted as the Excel adapter converts it; a chart of one of the newer types is read from its own part (`chartExN.xml`).

The file says some things Office.js does not tell the Excel adapter, so a chart in PowerPoint or Word reads them:

- **A waterfall's totals.** The points the author set as totals stand on the baseline, and the running total goes on from them.
- **A pie of pie's custom split.** The points the author moved into the second plot one by one are split off, rather than the chart reading as one pie.
- **A treemap's or sunburst's levels**, from the levels the chart keeps of its categories, a blank parent carried down from the one above.
- **Dates**, written as the chart's number format, or its date axis, writes them: `Jan-24` for `mmm-yy`.

## How the Chart Is Read

The adapter never imports Office.js. It reads the `Office`, `PowerPoint` and `Word` objects the page loaded structurally, so any Office.js version is accepted as it is.

- **PowerPoint** hands over its presentation through `Document.getFileAsync` (the `Compressed` file type), which PowerPoint offers on the web, on Windows, on Mac and on iPad. The file comes in slices of 4 MB (64 KB on iPad), fetched as the read needs them: the zip directory at the end, then the presentation's slide list, each slide, its relationships and its charts — and nothing else, so a presentation's pictures and videos are not fetched. Deflated parts are inflated by the browser's own `DecompressionStream`, in every webview current Office uses (Chromium-based Edge and WebView2, Safari 16.4 and later). Following the selection reads the selected slide and shape through PowerPointApi 1.5; without it, the picker alone chooses the chart.
- **Word** hands over its body as a flat Open XML package through `Body.getOoxml`, every part inline, and the selection the same way through `Range.getOoxml`. Both need WordApi 1.1: Word on the web, Word 2016 or later on Windows, Word on Mac and on iPad.

A presentation's charts are found slide by slide in the order of the slide show, and on each slide in the order its shapes are drawn, charts inside groups included. A document's are found in reading order. Office often writes a chart twice, once for current versions and once as a fallback picture for older ones, inside a markup-compatibility block; the fallback is skipped, so every chart is read once.

Each chart is read from the copy of its values the part keeps, as the Excel adapter reads Office.js's answers: a blank is a gap, never a zero, unless the chart plots blanks as zeros; categories keep their order; a series without a name is called `Series1`, `Series2`, as Excel calls it; a scatter whose x values are missing or text is plotted, and read, at 1, 2, 3. The chart's title is its own, or, for a chart of one named series whose automatic title the author has not deleted, the series' name, as the application shows it. An axis title is read when the axis is shown, and a series measured on the far value axis is read against it.

## Keyboard

Reaching the task pane is the application's keyboard model. In PowerPoint and Word for Windows and Mac, <kbd>F6</kbd> moves focus between the main areas of the window — the document, the ribbon, the status bar and an open task pane — and <kbd>Shift</kbd>+<kbd>F6</kbd> moves back; on the web the keys are <kbd>Ctrl</kbd>+<kbd>F6</kbd> and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F6</kbd>. Inside the pane, <kbd>Tab</kbd> moves from the **Chart** picker to MAIDR's figure (or to the pane's message), and on to **Read again**.

Once the figure is focused, the standard MAIDR shortcuts apply, as in the [Excel guide](excel.md#keyboard); the [Keyboard Controls](CONTROLS.md) reference lists them all. A pie of pie or bar of pie is two panels, so its figure opens at MAIDR's lobby: the arrow keys choose a panel, <kbd>Enter</kbd> goes into it and <kbd>Escape</kbd> comes back out.

## API Reference

### `bindOffice(container, options?)`

Mounts the pane for the application the page is open in, and returns a `Promise` of its binding: `bindExcel`'s in Excel (an `ExcelBinding`), and in PowerPoint and Word an `OfficeBinding`. Anywhere else — Outlook, or outside Office — it mounts a PowerPoint pane, which says it found no PowerPoint or Word to read. It never rejects. Its options are `OfficeBindOptions`, and `excel` for the options of Excel's pane (see [`ExcelBindOptions`](excel.md#excelbindoptions)).

### `bindPowerPoint(container, options?)` and `bindWord(container, options?)`

Mount one application's pane. Each returns a `Promise<OfficeBinding>` that resolves once the first chart has been read, and never rejects.

### `OfficeBindOptions`

| Option | Type | Description |
|---|---|---|
| `office` | `OfficeAppHost?` | The `Office` namespace. Default `window.Office`. |
| `powerpoint` | `PowerPointHost?` | The `PowerPoint` namespace. Default `window.PowerPoint`. |
| `word` | `WordHost?` | The `Word` namespace. Default `window.Word`. |
| `followSelection` | `boolean?` | Show the chart the user selects. Default `true`. |
| `selectionDelay` | `number?` | Milliseconds the selection has to settle before it is followed. Default `250`. |
| `id` | `string?` | The figure id, unique on the page. Default `maidr-office-<n>`. |
| `labels` | `Partial<OfficePaneLabels>?` | Replacements for the pane's wording: `picker`, `choose`, `refresh`, `reading`, `read` (`{count}` is how many charts), `loading`, `noCharts`, `noData`, `unsupported` (`{type}` names the chart type), `unreadable`, `partial` (`{series}` names what was left out), `noOffice`, `unsupportedHost` (`{host}` names the application), `readFailed`, `chartGone`, and the picker's `slide`, `hiddenSlide` and `documentChart` (`{n}` and `{title}`). `DEFAULT_OFFICE_LABELS` holds the English defaults. |

### `OfficeBinding`

| Member | Type | Description |
|---|---|---|
| `host` | `'PowerPoint' \| 'Word'` | The application the pane reads. |
| `maidr` | `Maidr \| null` | The figure on show, or `null` while the pane shows a message. |
| `chart` | `OfficeChartInfo \| null` | The chart on show. |
| `charts` | `readonly OfficeChartInfo[]` | Every chart the picker offers: `{ id, position, name, title?, description?, label }`. |
| `show` | `(chartId?: string) => Promise<void>` | Show a chart by id; with no id, the chart on show, or else the first. |
| `refresh` | `() => Promise<void>` | Read the file again, as **Read again** does. |
| `dispose` | `() => Promise<void>` | Stop following the selection, and unmount MAIDR and the wrapper. |

### Reading without the pane

`readPowerPointCharts(office)` and `readWordCharts(word)` read every chart of the open file, as `OfficeChart`s: `{ id, position, name, description?, slideId?, shapeId?, hidden?, snapshot }`, where `snapshot` is the `ExcelChartSnapshot` the Excel adapter's `convertExcelChart` turns into a MAIDR figure, or `null` for a chart whose part cannot be read. `readChartPart(root)` and `readChartExPart(root)` read one chart part's root element, for a file read some other way.

```ts
import { convertExcelChart, readPowerPointCharts } from 'maidr/office';

const charts = await readPowerPointCharts(Office);
const maidr = convertExcelChart(charts[0]?.snapshot);
```

### Script tags

The UMD build (`dist/office.js`) exposes `window.maidrOffice` with `bindOffice`, `bindPowerPoint`, `bindWord`, `bindExcel`, `convertExcelChart`, `readPowerPointCharts`, `readWordCharts`, `readChartPart`, `readChartExPart` and `DEFAULT_OFFICE_LABELS`.

### Type exports

The `Office…`, `PowerPoint…` and `Word…` interfaces exported from `maidr/office` are **minimal structural types**: only the parts of Office.js the adapter reads, so nothing here depends on `@types/office-js`.

## Limitations

- **The application's own chart is unchanged.** The reading happens in the task pane; the chart on the slide or the page stays as inaccessible as the application makes it.
- **No picture of the chart in the pane.** Neither PowerPoint nor Word hands one to an add-in, so the pane shows MAIDR's figure around the chart's name, and MAIDR outlines nothing as the reader moves.
- **Edits are read when asked for.** PowerPoint and Word do not tell an add-in that a chart's data changed. An edited chart is read again with **Read again**, by reopening the pane, or, in Word, by selecting it.
- **What the file keeps is what is read.** A chart is read from the values cached in it, which PowerPoint and Word write whenever they save a chart. A chart whose part another program wrote without them is said to be unreadable, and so is one whose part is missing or damaged.
- **A chart is matched to the selection by its slide and its shape.** PowerPoint's selection is matched to the charts read by the selected slide's position and the shape's id or name; a chart in a group is matched when the chart itself is selected, not the group.
- **Only the slides and the body.** Charts on slide layouts, slide masters and notes pages, and in Word's headers, footers and footnotes, are not listed. An Excel chart pasted as an embedded object is an object, not a chart, and is not read.
- **PowerPoint needs `DecompressionStream`.** Every webview current Office uses has it; an Office old enough to lack it gets the pane's message saying it cannot share its charts.
- **Tested with a simulated Office.js, not inside PowerPoint or Word.** The unit tests and the end-to-end spec drive the adapter against a stand-in for Office.js written from Microsoft's API reference, and its reading against a presentation written by python-pptx and parts written as Office writes them. Nothing here has yet been run inside PowerPoint or Word, or checked with a screen reader there.

## Examples

- [office-taskpane.html](examples/office-taskpane.html) simulates a task pane without PowerPoint or Word. It writes a presentation of three charts — a clustered column chart with a blank cell, a waterfall with two totals, and a pie of pie split by hand on a hidden slide — installs a stand-in for Office.js that hands it over, and has buttons for what a user does on the slides: selecting a chart, selecting a title, editing a chart's data. Add `?host=Word` to the address for a Word document of two charts. It loads the built bundles from `../dist/`, so run `npm run build` first.

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
