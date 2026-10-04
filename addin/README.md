# MAIDR Accessible Charts: the Office add-in

The Office add-in MAIDR publishes, for Excel, PowerPoint and Word. Its users' guide, with the install steps and the privacy statement, is [docs/office-addin.md](../docs/office-addin.md), served at <https://maidr.ai/office-addin.html>. This file is for the people who maintain it.

## What is in it

| File                     | What it does                                                                                                                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.xml`           | The add-in's manifest: its id, name, icons and support page, the three hosts (`Workbook`, `Presentation`, `Document`), `ReadWriteDocument`, and an **Accessible Charts** button in a **MAIDR** group on each host's **Home** tab that opens the task pane. Every URL is on `https://maidr.ai/addin/`. |
| `taskpane.html`          | The task pane. Loads Office.js from Microsoft's CDN and MAIDR from the site's `dist/`, and calls `maidrOffice.bindOffice`, which mounts the pane for whichever application opened it ([docs/office.md](../docs/office.md)).                                                                           |
| `commands.html`          | The function file every add-in with commands has to declare. The one button opens the pane, so it runs no code.                                                                                                                                                                                       |
| `assets/icon.svg`        | The icon: the braille cell for "r" from MAIDR's logo, in the logo's colours.                                                                                                                                                                                                                          |
| `assets/icon-<size>.png` | The icon rendered at 16, 20, 24, 32, 40, 48, 64, 80, 128 and 300 pixels by `node scripts/render-addin-icons.mjs`.                                                                                                                                                                                     |

## How it is served

`scripts/build-site.js` copies this folder, but for this file, into `_site/addin/`, and the Deploy Documentation workflow publishes `_site` to GitHub Pages at `https://maidr.ai`. The workflow runs on a change to this folder, to `src/`, or to the docs, and after each release.

The task pane loads `../dist/maidr.js` and `../dist/office.js`: the site's own copy of the library, built from `main` by the same workflow. So the add-in runs what `main` holds after each deploy, as the site's examples do, and a change to the adapters reaches its users with the next deploy. Nothing has to be installed again.

## Changing it

- **Change `<Version>` in `manifest.xml` whenever the manifest changes.** Office and the Microsoft Marketplace use it to tell an update. A change to the pages, the icons or the library needs no new version: Office loads them from the site each time.
- **Keep `<Id>`.** It is the add-in's identity wherever it has been installed or deployed.
- **Render the icons after changing `icon.svg`:** `node scripts/render-addin-icons.mjs`. Set `CHROMIUM_PATH` to use a Chromium other than Playwright's.
- **Validate the manifest:** `npx office-addin-manifest validate addin/manifest.xml`. This sends it to Microsoft's validation service.
- `test/addin/manifest.test.ts` checks the manifest offline. It checks:
  - the three hosts and the permission;
  - that every URL is on `https://maidr.ai/addin/` and names a file in this folder;
  - that every icon has the size it is declared at;
  - that every `resid` resolves;
  - that the strings fit Office's limits.

To try a change before it is deployed, serve the repository on `https://localhost:3000`, as [the Excel sample](../examples/excel-addin/README.md#run-it) does. Then add a copy of `manifest.xml` with `https://maidr.ai` replaced by `https://localhost:3000`, and give that copy an id of its own, so it is not mistaken for the published add-in.

## Publishing in the Microsoft Marketplace

The add-in is not listed yet. Listing it is done in [Partner Center](https://partner.microsoft.com/dashboard/marketplace-offers/overview) by whoever holds the project's publisher account. It needs:

- the manifest, which validates;
- the privacy statement at `https://maidr.ai/office-addin.html#privacy`, and the support page at `https://maidr.ai/office-addin.html`;
- a 300 × 300 icon (`assets/icon-300.png`), screenshots, and a short and a long description;
- test notes: any workbook, presentation or document with a chart is enough to try it.

Microsoft's [validation policies](https://learn.microsoft.com/legal/marketplace/certification-policies#1100-microsoft-365-and-sharepoint) apply. One of them is that an add-in has to work on every platform its hosts support. The ones that touch this add-in, and where they stand:

- **Excel** reads charts with ExcelApi 1.12. An older Excel opens the pane and says why it cannot read.
- **PowerPoint** reads its file with `getFileAsync`, which every platform has.
- **Word** reads its body with WordApi 1.1, which every platform has.
