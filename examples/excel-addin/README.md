# MAIDR accessible charts: a sample Excel add-in

A minimal [Office Add-in](https://learn.microsoft.com/office/dev/add-ins/overview/office-add-ins) built on MAIDR's [Excel adapter](../../docs/excel.md): a manifest and a task pane page, served from your machine and added to Excel for development. Copy it as the starting point for your own add-in. The add-in MAIDR publishes, ready to install in Excel, PowerPoint and Word, is [MAIDR Accessible Charts](../../docs/office-addin.md).

The task pane lists every chart in the workbook in a picker labelled **Chart**, follows the chart selected in the grid, and gives a keyboard or screen-reader user MAIDR's reading of it: sonification, text descriptions, braille and keyboard navigation. It reads the chart through Office.js; Excel's own chart in the grid is unchanged.

## What is in it

| File | What it does |
|---|---|
| `manifest.xml` | A task pane add-in for workbooks (`Host Name="Workbook"`) whose page is `https://localhost:3000/examples/excel-addin/taskpane.html`. It has no ribbon button, no icons and no `Requirements` element; the comment at its top says why. |
| `taskpane.html` | Loads Office.js from Microsoft's CDN and MAIDR from this repository's `dist/`, and calls `bindExcel` from `Office.onReady`. |

## Run it

You need Node.js 20.19 or later, and a Microsoft account, or a work or school one, to use Excel on the web.

1. **Build MAIDR**, in the repository root. The task pane loads `dist/maidr.js` and `dist/excel.js` from there.

   ```bash
   npm install
   npm run build
   ```

2. **Trust a certificate for `localhost`.** Excel loads a task pane only over `https`. Microsoft's [`office-addin-dev-certs`](https://www.npmjs.com/package/office-addin-dev-certs) creates a development certificate authority and a certificate for `localhost` in `.office-addin-dev-certs` in your home folder, and asks to install the authority as trusted. The certificate is valid for 30 days; run the command again when it expires.

   ```bash
   npx office-addin-dev-certs install
   ```

3. **Serve the repository root on port 3000**, with that certificate. `http-server` is one of the repository's development dependencies; `-c-1` turns off caching, so a rebuilt `dist/` is picked up.

   ```bash
   npx http-server -S -C ~/.office-addin-dev-certs/localhost.crt -K ~/.office-addin-dev-certs/localhost.key -p 3000 -c-1
   ```

   On Windows, start the paths with `%USERPROFILE%\` in `cmd` or `$HOME\` in PowerShell instead of `~/`. Open `https://localhost:3000/examples/excel-addin/taskpane.html` in a browser to check: it should load with no certificate warning, and say that MAIDR could not find Excel, since outside Excel there is no workbook to read. A warning means the browser does not trust the authority yet; import `ca.crt`, from the same folder, into it.

4. **Add it to Excel on the web.** Open a workbook at [office.com](https://www.office.com/), select **Home** > **Add-ins**, then **More Settings**, and on the **Office Add-ins** dialog select **Upload My Add-in**. Browse to `manifest.xml` and select **Upload**. With no ribbon button to wait for, the task pane opens straight away. Excel on the web keeps an uploaded add-in in the browser's storage, so in another browser, or after clearing its cache, upload it again.

   For Excel on Windows or Mac, Microsoft describes sideloading a manifest from a [shared folder catalog](https://learn.microsoft.com/office/dev/add-ins/testing/create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins) on Windows and from the [`wef` folder](https://learn.microsoft.com/office/dev/add-ins/testing/sideload-an-office-add-in-on-mac) on Mac.

5. **Read a chart.** Insert a chart, or open a workbook that has some. The pane shows the chart selected in the grid, or else the first. Move to the pane with <kbd>F6</kbd> (<kbd>Ctrl</kbd>+<kbd>F6</kbd> in Excel on the web), choose a chart from the picker, and press <kbd>Tab</kbd> to reach MAIDR's figure; the [Keyboard](../../docs/excel.md#keyboard) section of the guide lists the keys from there.

To check the manifest, run `npx office-addin-manifest validate manifest.xml` in this folder. It sends the manifest to Microsoft's validation service, which reports that it follows the manifest schema, and then two errors: no support URL and no icon. Both are requirements of a listing in the Microsoft Marketplace, not of sideloading.

## Limitations

This is a sample for development, not an add-in to hand to readers. Everything in the adapter's [Limitations](../../docs/excel.md#limitations) applies, and in particular:

- **It runs only where you serve it.** Every URL in the manifest is `https://localhost:3000`, so the add-in works on the machine serving the page, while it is served. To share it, host `taskpane.html`, `dist/maidr.js` and `dist/excel.js` on an `https` origin of your own and change `SourceLocation`.
- **No ribbon button and no icons.** Excel opens the pane when the add-in is added; a published add-in would add a button through `VersionOverrides`, icons, and a support URL.
- **`ReadWriteDocument`, although nothing is written.** Office requires the read/write permission of every add-in that uses the Excel JavaScript API, even one that only reads, as Microsoft's [permissions article](https://learn.microsoft.com/office/dev/add-ins/develop/requesting-permissions-for-api-use-in-content-and-task-pane-add-ins) says. The pane reads charts, cells and pictures, and writes nothing.
- **Older Excel versions get a message, not a hidden add-in.** Without ExcelApi 1.12 (Excel 2019 and older perpetual versions), the pane opens and says it cannot read the charts. Declaring the requirement in the manifest hides the add-in there instead; the guide's [Quick Start](../../docs/excel.md#2-the-manifest) shows how.
- **Not yet tried in Excel.** The manifest passes Microsoft's schema validation, and the page has been loaded in Chromium outside Excel, with the Office.js from npm (`@microsoft/office-js` 1.1.110) in place of the CDN's, where it mounts and says it cannot find Excel. The pane itself is tested against a simulated Office.js. It has not been added to Excel on the web, Windows or Mac, or checked with a screen reader in Excel.
