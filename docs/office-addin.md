# MAIDR Accessible Charts for Office

**MAIDR Accessible Charts** is an add-in for Microsoft Excel, PowerPoint and Word. It opens a pane beside your workbook, presentation or document where you can read any of its charts without seeing them:

- **hear** each value as a tone, higher for larger values (sonification);
- **read** each value as text, announced by your screen reader;
- **read it in braille** on a braille display;
- **move through it** with the arrow keys, point by point, series by series.

It is free and open source, made by the [MAIDR project](https://maidr.ai/) of the [(x)Ability Design Lab](https://xabilitylab.ischool.illinois.edu/) at the University of Illinois Urbana-Champaign, for blind and low-vision readers and anyone who wants to explore a chart by ear.

> **Status.** The add-in is new. It is not yet listed in the Microsoft Marketplace, so you add it from its manifest, as below. It has been tested with a simulated Office, not yet inside every version of Excel, PowerPoint and Word, or with every screen reader. Please [tell us](#support) what works and what does not.

## Install

You add the add-in once, from its manifest: a small file that tells Office where the add-in is.

**Manifest:** [https://maidr.ai/addin/manifest.xml](https://maidr.ai/addin/manifest.xml). To download it, open the link's context menu and choose **Save link as**.

### Office on the web

Office on the web is Excel, PowerPoint and Word at [office.com](https://www.office.com/), in any browser.

1. Download the manifest.
2. Open a workbook, presentation or document.
3. Select **Home** > **Add-ins**, then **More Settings** (or **Advanced**).
4. In the **Office Add-ins** dialog, select **Upload My Add-in**.
5. Browse to the manifest, and select **Upload**.

The **Accessible Charts** button is now on the **Home** tab. Office on the web keeps an uploaded add-in in the browser's storage, so in another browser, or after clearing its data, upload it again.

### Office on Windows and Mac

On a Mac, copy the manifest into the add-ins folder (`wef`) of each application, as Microsoft's [sideloading guide for Mac](https://learn.microsoft.com/office/dev/add-ins/testing/sideload-an-office-add-in-on-mac) describes. Then restart the application.

On Windows, add the manifest from a [shared folder catalog](https://learn.microsoft.com/office/dev/add-ins/testing/create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins).

Both are meant for trying an add-in. For everyone in an organization, an administrator can deploy it, as below.

### For an organization

A Microsoft 365 administrator can add the add-in for some or all of an organization's users, on the web, Windows and Mac at once:

1. In the [Microsoft 365 admin center](https://admin.microsoft.com/), go to **Settings** > **Integrated apps**.
2. Select **Upload custom apps**, and choose **Office Add-in**.
3. Choose to provide a link to the manifest, and enter `https://maidr.ai/addin/manifest.xml`.
4. Choose the users or groups, and deploy.

The add-in then appears on the **Home** tab for those users, usually within a few hours. Microsoft's [Centralized Deployment guide](https://learn.microsoft.com/microsoft-365/admin/manage/manage-deployment-of-add-ins) covers the details.

## Use it

1. **Open a file with charts.**
2. **Open the pane.**
   - With the mouse, select **Home** > **Accessible Charts**.
   - With the keyboard, show the ribbon's key tips, then press the keys shown: <kbd>H</kbd> for **Home**, then those on **Accessible Charts**. Key tips show with <kbd>Alt</kbd> on Windows. In Office on the web they show with <kbd>Alt</kbd>+<kbd>Windows logo key</kbd> on Windows, and with <kbd>Ctrl</kbd>+<kbd>Option</kbd> on a Mac.
3. **Move into the pane.** Press <kbd>F6</kbd>, or <kbd>Ctrl</kbd>+<kbd>F6</kbd> in Office on the web, until you reach it. <kbd>Shift</kbd>+<kbd>F6</kbd> moves back.
4. **Choose a chart.** The **Chart** list names every chart in the file:
   - in Excel by worksheet;
   - in PowerPoint by slide;
   - in Word in reading order.
   When you select a chart in the file, the pane shows it.
5. **Read it.** Press <kbd>Tab</kbd> to reach the chart. Then:
   - the arrow keys move from point to point, and from series to series;
   - <kbd>S</kbd> turns the sound on and off;
   - <kbd>T</kbd> turns the text on and off;
   - <kbd>B</kbd> turns braille on and off;
   - <kbd>R</kbd> turns review mode on and off;
   - <kbd>Ctrl</kbd>+<kbd>/</kbd> (<kbd>Command</kbd>+<kbd>/</kbd> on a Mac) lists every shortcut.

   The [Keyboard Controls](CONTROLS.md) page describes them all.

In Excel, the pane reads a chart again as soon as its data changes. In PowerPoint and Word, Office does not say when a chart changes. After you edit one, choose **Read again**, or, in Word, select the chart.

## What it reads

The add-in reads every chart type Excel, PowerPoint and Word draw:

- column, bar, line, pie, doughnut and area charts;
- scatter, bubble, radar, stock and surface charts;
- the newer histogram, Pareto, box and whisker, waterfall, funnel, treemap, sunburst and map charts.

Some readings are experimental. The [Excel](excel.md#supported-chart-types) and [PowerPoint and Word](office.md) guides list each type, how it is read, and what is not read yet.

The add-in does not change your file, and it does not make the chart in the file itself accessible: the reading is in the pane.

## Privacy

The add-in does not collect, store or send your files or your data.

- **Your file stays on your device.** The add-in reads the charts of the open file in the pane, inside Office, and sends neither the file nor its charts anywhere:
  - in Excel, through Office's own add-in interface;
  - in PowerPoint and Word, from the file Office hands the pane.
  Nothing it reads is kept after the pane closes.
- **Your settings stay in the pane.** MAIDR's settings, such as your sound and braille preferences, are kept in the pane's browser storage on your device.
- **No accounts, no analytics, no tracking.**
- **Loading the pane.** Opening the pane downloads its pages and MAIDR's scripts from `maidr.ai`, which GitHub Pages serves, and Office's add-in library from Microsoft. Like any web request, these let GitHub and Microsoft see your IP address and browser, under their own privacy statements.
- **AI descriptions are off unless you turn them on.** MAIDR can describe a chart with an AI model, but only after you choose a provider (OpenAI, Anthropic, Google Gemini, or a model you run yourself with Ollama) and enter your own API key in MAIDR's settings. Then the chart's data and your questions are sent to that provider, under its terms. The key is kept in the pane's browser storage.

Questions about privacy are welcome as an [issue](https://github.com/xability/maidr/issues).

## Support

- **Report a problem or ask a question:** [github.com/xability/maidr/issues](https://github.com/xability/maidr/issues). Say which application and version you use (Excel, PowerPoint or Word; on the web, Windows, Mac or iPad), and, if it is about a chart, what kind of chart it is.
- **What is known not to work yet:** the [Excel](excel.md#limitations) and [PowerPoint and Word](office.md#limitations) guides list the limitations.

## For developers

The add-in is the `addin/` folder of the [MAIDR repository](https://github.com/xability/maidr/tree/main/addin): its manifest, its task pane page and its icons. The pane calls `bindOffice` from `maidr/office`, which the [PowerPoint and Word guide](office.md) documents. To build an add-in of your own on MAIDR, start from that guide and the [Excel guide](excel.md).
