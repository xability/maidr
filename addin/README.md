# MAIDR's Office add-ins

The two Office add-ins MAIDR publishes: **MAIDR Accessible Charts**, a task pane for Excel, PowerPoint and Word, and **MAIDR Chart on Slide**, a content add-in that sits on a PowerPoint slide and reads one chart there. Their users' guide, with the install steps and the privacy statement, is [docs/office-addin.md](../docs/office-addin.md), served at <https://maidr.ai/office-addin.html>. This file is for the people who maintain them.

## What is in it

| File                     | What it does                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.xml`           | The task pane's manifest, **MAIDR Accessible Charts**: its id, name, icons and support page, the three hosts (`Workbook`, `Presentation`, `Document`), `ReadWriteDocument`, and an **Accessible Charts** button in a **MAIDR** group on each host's **Home** tab that opens the task pane. Every URL is on `https://maidr.ai/addin/`. |
| `taskpane.html`          | The task pane. Loads Office.js from Microsoft's CDN and MAIDR from the site's `dist/`, and calls `maidrOffice.bindOffice`, which mounts the pane for whichever application opened it ([docs/office.md](../docs/office.md)).                                                                                                           |
| `commands.html`          | The function file every add-in with commands has to declare. The one button opens the pane, so it runs no code.                                                                                                                                                                                                                       |
| `slide-manifest.xml`     | The manifest of the add-in on the slide, **MAIDR Chart on Slide**: a content add-in with an id of its own, for `Presentation` alone, `ReadWriteDocument`, the size it starts at (480 × 270), and `AllowSnapshot`. No button. Every URL is on `https://maidr.ai/addin/`.                                                               |
| `slide.html`             | The add-in on the slide. Loads Office.js and MAIDR as the task pane does, and calls `maidrOffice.bindSlideChart`, which reads the chart the add-in is linked to from the presentation file ([docs/office.md](../docs/office.md)).                                                                                                     |
| `assets/icon.svg`        | The icon: the braille cell for "r" from MAIDR's logo, in the logo's colours.                                                                                                                                                                                                                                                          |
| `assets/icon-<size>.png` | The icon rendered at 16, 20, 24, 32, 40, 48, 64, 80, 128 and 300 pixels by `node scripts/render-addin-icons.mjs`.                                                                                                                                                                                                                     |

## The add-in on the slide

MAIDR Chart on Slide is a separate add-in from the task pane, not a second view of it. How it differs:

- **It is a content add-in.** It sits on a slide as a shape, which the author places and sizes, beside the chart or over it, and the audience sees it in the slide show. One manifest describes a task pane add-in or a content add-in, never both, so it has a manifest and an `<Id>` of its own, and is installed on its own.
- **It has no button.** It is inserted from **Add-ins** on the **Insert** tab, so it has no `VersionOverrides` and no commands page. `RequestedWidth` and `RequestedHeight` are the size it starts at.
- **It reads one chart.** Which one is the add-in's link, kept in its settings (`Document.settings`), which PowerPoint saves in the presentation with each copy of the add-in: the chart's slide id and shape id, and its name. The first time, it links the one chart on its slide, or offers a **Chart** list.
- **It follows the view.** In Normal view it shows the figure, then the list and **Read again**. In the slide show and Reading View it shows the figure alone, read again as the view opens.
- **`ReadWriteDocument`**, although it changes nothing on the slides: reading the file takes `ReadAllDocument`, and following the view (`Document.addHandlerAsync`) takes `ReadWriteDocument`, as every event does.
- **`AllowSnapshot`**: a picture of the add-in is saved with the presentation, for a PowerPoint that cannot run it.
- **The page has no heading, link or control of its own**: the first <kbd>Tab</kbd> into the add-in reaches the chart, and in the slide show the chart is all there is.

## How it is served

`scripts/build-site.js` copies this folder, but for this file, into `_site/addin/`, and the Deploy Documentation workflow publishes `_site` to GitHub Pages at `https://maidr.ai`. The workflow runs on a change to this folder, to `src/`, or to the docs, and after each release.

The task pane and the add-in on the slide load `../dist/maidr.js` and `../dist/office.js`: the site's own copy of the library, built from `main` by the same workflow. So the add-ins run what `main` holds after each deploy, as the site's examples do, and a change to the adapters reaches their users with the next deploy. Nothing has to be installed again.

## Changing it

- **Change `<Version>` in a manifest whenever that manifest changes**, `manifest.xml` or `slide-manifest.xml`. Office and the Microsoft Marketplace use it to tell an update. A change to the pages, the icons or the library needs no new version: Office loads them from the site each time.
- **Keep `<Id>`, in both manifests.** It is the add-in's identity wherever it has been installed or deployed, and, for the add-in on the slide, in every presentation it has been inserted in. The two ids must differ.
- **Render the icons after changing `icon.svg`:** `node scripts/render-addin-icons.mjs`. Set `CHROMIUM_PATH` to use a Chromium other than Playwright's.
- **Validate the manifests:** `npx office-addin-manifest validate addin/manifest.xml`, and the same for `addin/slide-manifest.xml`. This sends them to Microsoft's validation service.
- `test/addin/manifest.test.ts` checks both manifests offline. It checks:
  - the task pane's three hosts and the permission;
  - that the add-in on the slide is a content add-in for `Presentation` alone, with an id other than the task pane's, its elements in the schema's order, no button, and a size from 32 to 1000 pixels each way;
  - that every URL is on `https://maidr.ai/addin/` and names a file in this folder;
  - that every icon has the size it is declared at;
  - that every `resid` resolves;
  - that the strings fit Office's limits;
  - that each page loads Office.js and MAIDR, and that `slide.html` has no heading, link or control of its own.

`e2e_tests/specs/officeAddin.spec.ts` and `e2e_tests/specs/officeSlideAddin.spec.ts` drive the two pages in a browser, with a stand-in for Office.js.

To try a change before it is deployed, serve the repository on `https://localhost:3000`, as [the Excel sample](../examples/excel-addin/README.md#run-it) does. Then add a copy of `manifest.xml` or `slide-manifest.xml` with `https://maidr.ai` replaced by `https://localhost:3000`, and give that copy an id of its own, so it is not mistaken for the published add-in.

## Publishing in the Microsoft Marketplace

Neither add-in is listed yet. Listing one is done in [Partner Center](https://partner.microsoft.com/dashboard/marketplace-offers/overview) by whoever holds the project's publisher account; each is an offer of its own, from its own manifest. Each needs:

- its manifest, which validates;
- the privacy statement at `https://maidr.ai/office-addin.html#privacy`, and the support page at `https://maidr.ai/office-addin.html`;
- a 300 × 300 icon (`assets/icon-300.png`), screenshots, and a short and a long description;
- test notes: any workbook, presentation or document with a chart is enough to try the task pane, and any presentation with a chart the add-in on the slide.

Microsoft's [validation policies](https://learn.microsoft.com/legal/marketplace/certification-policies#1100-microsoft-365-and-sharepoint) apply. One of them is that an add-in has to work on every platform its hosts support. The ones that touch these add-ins, and where they stand:

- **Excel** reads charts with ExcelApi 1.12. An older Excel opens the pane and says why it cannot read.
- **PowerPoint** reads its file with `getFileAsync`, which every platform has.
- **Word** reads its body with WordApi 1.1, which every platform has.
- **The add-in on the slide** reads its file with `getFileAsync` too. It keeps its link with `Document.settings`, asks for the view with `getActiveViewAsync`, and for the slide it is on with `getSelectedDataAsync`. Where one of those is missing it does without: the link lasts until the add-in closes, it shows Normal view's controls, or it offers the **Chart** list.
