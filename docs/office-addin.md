# MAIDR Accessible Charts for Office

**MAIDR Accessible Charts** is an add-in for Microsoft Excel, PowerPoint and Word. It opens a pane beside your workbook, presentation or document where you can read any of its charts without seeing them:

- **hear** each value as a tone, higher for larger values (sonification);
- **read** each value as text, announced by your screen reader;
- **read it in braille** on a braille display;
- **move through it** with the arrow keys, point by point, series by series.

It is free and open source, made by the [MAIDR project](https://maidr.ai/) of the [(x)Ability Design Lab](https://xabilitylab.ischool.illinois.edu/) at the University of Illinois Urbana-Champaign, for blind and low-vision readers and anyone who wants to explore a chart by ear.

For PowerPoint there is a second add-in, [MAIDR Chart on Slide](#maidr-chart-on-slide). It puts the same reading on the slide itself, beside one of its charts, so it is there in the slide show too.

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

The pane does not change your file. Neither it nor MAIDR Chart on Slide makes the chart in the file itself accessible: the reading is in the pane, or in the add-in's box on the slide.

## MAIDR Chart on Slide

**MAIDR Chart on Slide** is a second add-in, for PowerPoint alone. The pane opens beside the presentation. This add-in sits on a slide, as a box you place beside one of PowerPoint's own charts, or over it. It reads that chart from the presentation, as the pane does, so you do not make the chart again. You move into the box and read the chart with the same keys as in the pane: in Normal view while you work, and in the slide show while you present.

Each box reads one chart, of any kind the pane reads. For two charts on a slide, insert it twice.

> **Status.** MAIDR Chart on Slide is newer than the pane. It has been tested only with a simulated PowerPoint: not yet inside PowerPoint, and not with a screen reader. Whether <kbd>Tab</kbd> reaches it, in Normal view and in the slide show, and how you move from it back to the slides, is up to PowerPoint, and we have not tried it yet. Please [tell us](#support) what you find.

### Add it to PowerPoint

It is a separate add-in, with a manifest of its own.

**Manifest:** [https://maidr.ai/addin/slide-manifest.xml](https://maidr.ai/addin/slide-manifest.xml). To download it, open the link's context menu and choose **Save link as**.

Add it in any of the ways under [Install](#install), with this manifest in place of the pane's: upload it in PowerPoint on the web, copy it into PowerPoint's add-ins folder on a Mac, add it from a shared folder catalog on Windows, or have an administrator deploy it from `https://maidr.ai/addin/slide-manifest.xml`. You can have both add-ins.

It puts no button on the ribbon. You insert it on a slide, as below. Adding it from a shared folder catalog inserts it at once, on the slide open in PowerPoint, and uploading it in PowerPoint on the web may do the same, so go to the slide with the chart first. That box is then the one to keep.

Each person who opens the presentation and wants to read the chart in the box needs MAIDR Chart on Slide added to their own PowerPoint, as above. The box goes with the presentation, but the add-in does not: without it, PowerPoint cannot run the box, and shows at most the picture of it saved with the presentation, which cannot be explored. They can read the chart in the pane instead.

### Put it on a slide

1. **Go to the slide with the chart**, in Normal view.
2. **Insert the add-in.** Select **Home** > **Add-ins**, and choose **MAIDR Chart on Slide** from your add-ins (in older versions, **Insert** > **My Add-ins**).
3. **Let it find the chart.** The add-in looks at the slide it was inserted on.
   - If the slide has one chart, the add-in reads it at once.
   - If it has several, or none, the add-in asks which chart to read. Choose one from its **Chart** list, which names every chart in the presentation, this slide's first. If the chart is not there yet, insert it on the slide, then choose **Read again**.
4. **Place it.** Move and size the box beside the chart, or over it. The audience sees the box in the slide show. It shows the chart's title, or, without one, its alternative text or its name.

The add-in keeps which chart it reads in the presentation. Once you save the presentation, it reads the same chart each time you open it. To read another chart, choose it from the **Chart** list. On Windows, the arrow keys change a closed list's choice directly, so each chart is linked as you reach it; to look through the list first, open it with <kbd>Alt</kbd>+<kbd>Down Arrow</kbd>.

### Read the chart on the slide

1. **Move into the add-in.** Click it, or press <kbd>Tab</kbd> until you reach it, if PowerPoint lets you. The first thing in it is the chart.
2. **Read it** with the same keys as in the pane, under [Use it](#use-it): the arrow keys move from point to point, and from series to series; <kbd>S</kbd>, <kbd>T</kbd>, <kbd>B</kbd> and <kbd>R</kbd> turn sound, text, braille and review mode on and off; <kbd>Ctrl</kbd>+<kbd>/</kbd> (<kbd>Command</kbd>+<kbd>/</kbd> on a Mac) lists every shortcut.
3. **In Normal view**, <kbd>Tab</kbd> goes on from the chart to the **Chart** list and the **Read again** button. In the slide show and in Reading View, the add-in shows the chart alone.

The add-in never moves your focus by itself. How you leave it, to go back to the slide or on to the next one, is up to PowerPoint.

PowerPoint does not tell the add-in when you edit a chart. After you edit one, choose **Read again** in Normal view. The slide show reads the chart again by itself as it starts, so it shows the chart as you last edited it.

- **If the chart is deleted**, the add-in says so. In Normal view, choose another from its **Chart** list.
- **If you duplicate the slide**, the add-in on the copy still reads the chart on the original slide. Choose the copy's chart from its **Chart** list.
- **If no chart is linked** when the slide show starts, the add-in says so. Link one in Normal view.

## Privacy

The add-ins do not collect or send your files or your data, and keep nothing of them outside your file.

- **Your file stays on your device.** The add-ins read the charts of the open file inside Office, and send neither the file nor its charts anywhere:
  - in Excel, through Office's own add-in interface;
  - in PowerPoint and Word, from the file Office hands the add-in.
  Nothing they read is kept after they close, but for the link below.
- **MAIDR Chart on Slide keeps its link in the presentation.** Which chart it reads (the chart's slide, its shape and its name) is saved in the presentation, as the add-in's own setting. PowerPoint also saves a picture of the add-in, as it last looked, with the presentation: usually the chart's name and the add-in's controls, and any of MAIDR's dialogs left open in it, such as the AI chat with your questions. Both go wherever the file goes.
- **Your settings stay in the add-in.** MAIDR's settings, such as your sound and braille preferences, are kept in the add-in's browser storage on your device.
- **No accounts, no analytics, no tracking.**
- **Loading the add-ins.** Opening the pane, or a slide with MAIDR Chart on Slide, downloads the add-in's pages and MAIDR's scripts from `maidr.ai`, which GitHub Pages serves, and Office's add-in library from Microsoft. Like any web request, these let GitHub and Microsoft see your IP address and browser, under their own privacy statements.
- **AI descriptions are off unless you turn them on.** MAIDR can describe a chart with an AI model, but only after you choose a provider (OpenAI, Anthropic, Google Gemini, or a model you run yourself with Ollama) and enter your own API key in MAIDR's settings. Then the chart's data and your questions are sent to that provider, under its terms. The key is kept in the add-in's browser storage.

Questions about privacy are welcome as an [issue](https://github.com/xability/maidr/issues).

## Support

- **Report a problem or ask a question:** [github.com/xability/maidr/issues](https://github.com/xability/maidr/issues). Say which application and version you use (Excel, PowerPoint or Word; on the web, Windows, Mac or iPad), whether you use the pane or MAIDR Chart on Slide, and, if it is about a chart, what kind of chart it is.
- **What is known not to work yet:** the [Excel](excel.md#limitations) and [PowerPoint and Word](office.md#limitations) guides list the limitations.

## For developers

The add-ins are the `addin/` folder of the [MAIDR repository](https://github.com/xability/maidr/tree/main/addin): their manifests, the task pane's page, the slide's page and the icons. The pane calls `bindOffice` from `maidr/office`, and MAIDR Chart on Slide calls [`bindSlideChart`](office.md#on-the-slide); the [PowerPoint and Word guide](office.md) documents both. To build an add-in of your own on MAIDR, start from that guide and the [Excel guide](excel.md).
