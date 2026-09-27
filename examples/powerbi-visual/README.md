# MAIDR Accessible Chart: a starter Power BI custom visual

A working [Power BI custom visual](https://learn.microsoft.com/power-bi/developer/visuals/develop-power-bi-visuals) built on MAIDR's [Power BI adapter](../../docs/powerbi.md). It builds into a `.pbiviz` file you can import into a report today, and it is meant to be copied and changed.

It runs in **companion mode**: it draws no chart of its own. You place it next to a native Power BI chart and drag the same fields into both. A keyboard or screen-reader user then presses <kbd>Enter</kbd> on the companion, and hears, navigates and brailles the data the native chart draws. As they move, the visual selects the data point they are on, so Power BI cross-highlights the native chart and the rest of the page.

## What is in it

| File | What it does |
|---|---|
| `pbiviz.json` | The visual's name, GUID, version and the visuals API version (5.11.1). |
| `capabilities.json` | Field wells (Axis, Legend, Values, plus X Axis and Y Axis for a scatter), a categorical mapping grouped by Legend, the format pane's *Accessible chart* card, `supportsKeyboardFocus` and empty `privileges`. |
| `src/visual.ts` | `bindPowerBI` in the constructor, `binding.update()` with the format-pane settings in `update()`, selection ids from `onNavigate`, focus handling, and `dispose()` in `destroy()`. |
| `src/settings.ts` | The format pane card: chart type, bar mode and title. |
| `style/visual.less` | Styles for the wrapper and companion mode's visible label. |
| `assets/icon.png` | The 20 × 20 icon shown in the Visualizations pane. |

## Build it

You need Node.js 20.19 or later.

```bash
npm install
npm run package
```

`npm run package` runs `pbiviz package --no-stats` and writes `dist/maidrAccessibleChartAE2812A6BA3E4541ABFCC2E157424941.1.0.0.0.pbiviz`. (`--no-stats` stops `pbiviz` writing `webpack.statistics.prod.html` beside the project, where MAIDR's examples gallery would find it as a page.) `pbiviz package` also runs Power BI's lint rules over `src/`; `npm run lint` runs them on their own.

`maidr/powerbi` first ships in the MAIDR release after 4.10.0, so until that release is on npm, `npm install` fails to find `maidr@^4.11.0`. Build MAIDR from this repository and install the tarball instead; `npm install` then fetches everything else from the registry:

```bash
# in the maidr repository root
npm install && npm run build && npm pack
# here
npm install ../../maidr-*.tgz
```

Installing the tarball rewrites this folder's `package.json` to `"maidr": "file:../../maidr-<version>.tgz"`. Keep that change local: do not commit it back to the MAIDR repository.

To try changes live against the Power BI service, turn on developer mode in the service's settings and run `npm start`; see Microsoft's [set-up guide](https://learn.microsoft.com/power-bi/developer/visuals/environment-setup).

## Use it in a report

1. In Power BI Desktop or the Power BI service, open the **Visualizations** pane, select **…** (Get more visuals), then **Import a visual from a file**, and choose the `.pbiviz` file.
2. Add a native chart, for example a clustered column chart, and set up its fields.
3. Add the **MAIDR Accessible Chart** visual beside it and drag the **same** fields into **Axis**, **Legend** and **Values**. For a scatter, use **X Axis (scatter)** and **Y Axis (scatter)** instead of **Values**.
4. In the format pane, open **Accessible chart** and set **Chart type** and **Bar mode** to match the native chart (MAIDR cannot tell a clustered chart from a stacked one by its data). Give it a **Title**, which is announced when the reader enters the chart and shown as the companion's visible label.
5. Size the companion small and keep it next to the native chart.

A reader tabs to the visual, presses <kbd>Enter</kbd> to move into it, and uses MAIDR's [keyboard controls](../../docs/CONTROLS.md): arrow keys to move, <kbd>B</kbd> for braille, <kbd>T</kbd> for text, <kbd>S</kbd> for sound. <kbd>Esc</kbd> returns to the report.

## Limitations

This is a starter, not a finished product. Everything in the adapter's [Limitations](../../docs/powerbi.md#limitations) applies, and in particular:

- **It cannot read the native chart itself.** Each custom visual runs in its own sandboxed iframe and receives only its own field wells, so the companion reads the same fields a second time. If the two visuals' fields, filters or chart type drift apart, the reader hears something other than what is drawn.
- **No drawing and no highlight of its own.** In companion mode the only visual feedback is Power BI's cross-highlighting of the other visuals. For a visual that draws its own chart, pass `chart` to `bindPowerBI` (chart mode) and highlight marks in `onNavigate`; see [Chart Mode and Companion Mode](../../docs/powerbi.md#chart-mode-and-companion-mode).
- **A selection on every arrow press.** Each move selects a data point, which makes Power BI re-query the visuals it cross-filters. On a heavy page, select only when the reader pauses, or drop the selection. Where the host does not allow interactions (`allowInteractions` is false), no selection is made.
- **<kbd>Esc</kbd> is shared.** Power BI uses <kbd>Esc</kbd> to leave a visual, and MAIDR uses it to leave braille mode and close its dialogs. Test both in the Power BI host your readers use.
- **Settings may not persist**, and **AI descriptions are off**: `privileges` is empty, so MAIDR's chat cannot reach a model provider. Adding a `WebAccess` privilege makes the visual ineligible for certification.
- **Not yet tried in Power BI.** The `.pbiviz` builds with `powerbi-visuals-tools` 7.2.1, and its bundle has been loaded outside Power BI with a stand-in host: it mounts, reads the format pane, selects data points as the reader moves and clears on leaving. It has not been run in Power BI Desktop or the Power BI service, or checked with readers.

## Publishing is a later step

Before this visual goes to AppSource it needs a support URL and contact of its own, its own GUID if you fork it, a privacy policy and EULA, and Power BI [visual certification](https://learn.microsoft.com/power-bi/developer/visuals/power-bi-custom-visuals-certified), which reviews the visual's source repository. None of that is done here.

`pbiviz package --certification-audit` already reports one blocker: the bundle contains five `fetch` calls, all from MAIDR's AI chat and its model-provider checks. Without a `WebAccess` privilege they fail and the rest of MAIDR keeps working, but certification does not allow them in the package at all, so a certified build has to leave the chat out.
