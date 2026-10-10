import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * E2E coverage for the add-in on the slide MAIDR publishes: addin/slide.html,
 * the page addin/slide-manifest.xml points PowerPoint at, which sits on a
 * slide and reads one of PowerPoint's own charts.
 *
 * The page loads Office.js from Microsoft's CDN, as an add-in must. Here that
 * request is answered with a stand-in for Office.js in PowerPoint: it hands
 * over a small presentation, written below as a zip file, as
 * `Document.getFileAsync` does, and keeps the add-in's settings, the view and
 * the slide selected. The page's own wiring -- the bundles it loads, its
 * bindSlideChart call, what comes first in the focus order -- and the
 * add-in's linking and views are what is driven, with real keypresses.
 *
 * What it cannot check is PowerPoint's half: whether Tab, F6 or a click
 * reaches the add-in on the slide, in Normal view and in the slide show, how
 * focus leaves it, and whether a screen reader there announces it. See
 * docs/office.md.
 *
 * Requires a built bundle (dist/maidr.js, dist/office.js), like every spec.
 */

const PAGE = 'addin/slide.html';
const OFFICE_JS = 'https://officeapis.public.onecdn.static.microsoft/1/office.js';

/** The setting the add-in keeps its link under. */
const LINK = 'maidr.chart';

const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
};
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';

function rels(links: readonly (readonly [string, string, string])[]): string {
  return `<?xml version="1.0"?><Relationships xmlns="${NS.rel}">${links
    .map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`)
    .join('')}</Relationships>`;
}

function cache(tag: string, values: readonly (string | number)[]): string {
  return `<c:${tag}><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:${tag}>`;
}

function title(text: string): string {
  return `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${text}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
}

/** A column chart of one series by quarter, titled as the series is. */
function columnChart(name: string, values: readonly number[]): string {
  const quarters = ['Q1', 'Q2'];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="${NS.c}" xmlns:a="${NS.a}" xmlns:r="${NS.r}">`
    + `<c:chart>${title(name)}<c:autoTitleDeleted val="0"/><c:plotArea>`
    + `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:ser><c:idx val="0"/><c:order val="0"/>`
    + `<c:tx><c:strRef><c:f>Sheet1!$B$1</c:f>${cache('strCache', [name])}</c:strRef></c:tx>`
    + `<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$3</c:f>${cache('strCache', quarters)}</c:strRef></c:cat>`
    + `<c:val><c:numRef><c:f>Sheet1!$B$2:$B$3</c:f>${cache('numCache', values)}</c:numRef></c:val></c:ser>`
    + `<c:axId val="1"/><c:axId val="2"/></c:barChart>`
    + `<c:catAx><c:axId val="1"/><c:scaling/><c:delete val="0"/><c:axPos val="b"/>${title('Quarter')}<c:crossAx val="2"/></c:catAx>`
    + `<c:valAx><c:axId val="2"/><c:scaling/><c:delete val="0"/><c:axPos val="l"/>${title(name)}<c:crossAx val="1"/></c:valAx>`
    + `</c:plotArea></c:chart></c:chartSpace>`;
}

/** A chart's frame on a slide: its shape id and name, and its part's relationship, `rId<n>`. */
function frame(id: number, name: string, n: number): string {
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${name}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>`
    + `<p:xfrm><a:off x="0" y="0"/><a:ext cx="6096000" cy="4064000"/></p:xfrm><a:graphic><a:graphicData uri="${NS.c}">`
    + `<c:chart xmlns:c="${NS.c}" r:id="rId${n}"/></a:graphicData></a:graphic></p:graphicFrame>`;
}

function slide(frames: string): string {
  return `<?xml version="1.0"?><p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld><p:spTree>`
    + `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${frames}</p:spTree></p:cSld></p:sld>`;
}

/**
 * The presentation: slide 1 (id 256) with one chart, Sales; slide 2 (id 257)
 * with two, Visitors and Costs.
 */
const PARTS: Record<string, string> = {
  '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  '_rels/.rels': rels([['rId1', `${REL}officeDocument`, 'ppt/presentation.xml']]),
  'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation xmlns:p="${NS.p}" xmlns:r="${NS.r}"><p:sldIdLst>`
    + `<p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`,
  'ppt/_rels/presentation.xml.rels': rels([['rId1', `${REL}slide`, 'slides/slide1.xml'], ['rId2', `${REL}slide`, 'slides/slide2.xml']]),
  'ppt/slides/slide1.xml': slide(frame(4, 'Chart 3', 1)),
  'ppt/slides/_rels/slide1.xml.rels': rels([['rId1', `${REL}chart`, '../charts/chart1.xml']]),
  'ppt/slides/slide2.xml': slide(frame(4, 'Chart 4', 1) + frame(5, 'Chart 5', 2)),
  'ppt/slides/_rels/slide2.xml.rels': rels([['rId1', `${REL}chart`, '../charts/chart2.xml'], ['rId2', `${REL}chart`, '../charts/chart3.xml']]),
  'ppt/charts/chart1.xml': columnChart('Sales', [120, 135]),
  'ppt/charts/chart2.xml': columnChart('Visitors', [1200, 1350]),
  'ppt/charts/chart3.xml': columnChart('Costs', [80, 95]),
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** A zip file of `parts`, stored, laid out as any zip writer lays one out. */
function zip(parts: Record<string, string>): number[] {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(parts)) {
    const data = encoder.encode(text);
    const nameBytes = encoder.encode(name);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034B50, true);
    header.setUint16(4, 20, true);
    header.setUint32(14, crc32(data), true);
    header.setUint32(18, data.length, true);
    header.setUint32(22, data.length, true);
    header.setUint16(26, nameBytes.length, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014B50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint32(16, crc32(data), true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    chunks.push(new Uint8Array(header.buffer), nameBytes, data);
    directory.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const size = directory.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054B50, true);
  end.setUint16(8, directory.length / 2, true);
  end.setUint16(10, directory.length / 2, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return [...chunks, ...directory, new Uint8Array(end.buffer)].flatMap(chunk => Array.from(chunk));
}

const PRESENTATION = zip(PARTS);

/** What the stand-in starts with. */
interface StandIn {
  /** What PowerPoint has open. Default `edit`, Normal view. */
  readonly view?: 'edit' | 'read';
  /** The slides selected, by id. Default none. */
  readonly selected?: readonly number[];
  /** The add-in's settings, as the presentation keeps them. Default none. */
  readonly settings?: Record<string, unknown>;
}

/**
 * A stand-in for Office.js in PowerPoint, serving {@link PRESENTATION}. It
 * puts `window.fakeOffice` on the page, for the test to change the view and
 * see what the add-in saved.
 */
function fakeOfficeJs({ view = 'edit', selected = [], settings = {} }: StandIn = {}): string {
  return `
    const succeeded = value => ({ status: 'succeeded', value });
    const info = { host: 'PowerPoint', platform: 'PC' };
    const bytes = new Uint8Array(${JSON.stringify(PRESENTATION)});
    const handlers = new Set();
    const memory = ${JSON.stringify(settings)};
    const fake = {
      view: ${JSON.stringify(view)},
      saved: ${JSON.stringify(settings)},
      saves: 0,
      reads: 0,
      changeView(view) {
        fake.view = view;
        handlers.forEach(handler => handler({ type: 'activeViewChanged', activeView: view }));
      },
    };
    window.fakeOffice = fake;
    // Office.js's async calls take their options and callback in either place.
    const done = (options, callback) => (typeof options === 'function' ? options : callback);
    window.Office = {
      context: {
        host: 'PowerPoint',
        platform: 'PC',
        document: {
          getFileAsync(type, { sliceSize }, callback) {
            fake.reads += 1;
            setTimeout(() => callback(succeeded({
              size: bytes.length,
              sliceCount: Math.ceil(bytes.length / sliceSize),
              getSliceAsync(index, sliced) {
                const data = Array.from(bytes.subarray(index * sliceSize, (index + 1) * sliceSize));
                setTimeout(() => sliced(succeeded({ data, index, size: data.length })), 0);
              },
              closeAsync(closed) {
                closed?.(succeeded());
              },
            })), 0);
          },
          getActiveViewAsync(options, callback) {
            done(options, callback)(succeeded(fake.view));
          },
          getSelectedDataAsync(type, options, callback) {
            // The slides' ids count up from 256, so a slide's place is its id less 255.
            const slides = ${JSON.stringify(selected)}.map(id => ({ id, title: '', index: id - 255 }));
            done(options, callback)(type === 'slideRange'
              ? succeeded({ slides })
              : { status: 'failed', error: { message: 'Only a slide range is offered here.' } });
          },
          addHandlerAsync(type, handler, options, callback) {
            if (type === 'activeViewChanged') handlers.add(handler);
            done(options, callback)?.(succeeded());
          },
          removeHandlerAsync(type, { handler }, callback) {
            handlers.delete(handler);
            callback?.(succeeded());
          },
          settings: {
            get: name => (name in memory ? memory[name] : null),
            set: (name, value) => {
              memory[name] = JSON.parse(JSON.stringify(value));
            },
            remove: (name) => {
              delete memory[name];
            },
            saveAsync(options, callback) {
              fake.saves += 1;
              fake.saved = JSON.parse(JSON.stringify(memory));
              done(options, callback)?.(succeeded());
            },
          },
        },
      },
      onReady(callback) {
        if (callback) callback(info);
        return Promise.resolve(info);
      },
    };
  `;
}

/**
 * Office.js as Microsoft's copy behaves on a page opened outside Office: it
 * loads, and `Office.onReady` never calls back.
 */
const UNANSWERED_OFFICE_JS = `
  window.Office = {
    onReady: () => new Promise(() => {}),
  };
`;

/** What the stand-in has seen: the settings saved, how many saves, and how many reads of the file. */
interface Seen {
  readonly saved: Record<string, unknown>;
  readonly saves: number;
  readonly reads: number;
}

async function open(page: Page, standIn: StandIn = {}): Promise<void> {
  await page.route(OFFICE_JS, route => route.fulfill({ contentType: 'text/javascript', body: fakeOfficeJs(standIn) }));
  await page.goto(PAGE);
}

function seen(page: Page): Promise<Seen> {
  return page.evaluate(() => {
    const { saved, saves, reads } = (window as unknown as { fakeOffice: Seen }).fakeOffice;
    return { saved, saves, reads };
  });
}

async function changeView(page: Page, view: 'edit' | 'read'): Promise<void> {
  await page.evaluate(to => (window as unknown as { fakeOffice: { changeView: (view: string) => void } }).fakeOffice.changeView(to), view);
}

/** The add-in's figure area: MAIDR's figure, or a message. */
function view(page: Page): Locator {
  return page.locator('#maidr [data-maidr-office-view]');
}

/** MAIDR's plot element, whichever role it has at the moment. */
function plot(page: Page): Locator {
  return view(page).locator('[tabindex="0"]').first();
}

function picker(page: Page): Locator {
  return page.locator('#maidr').getByLabel('Chart');
}

function readAgain(page: Page): Locator {
  return page.locator('#maidr').getByRole('button', { name: 'Read again' });
}

/** Polls until MAIDR's text region contains `expected`. */
async function waitForText(page: Page, expected: string): Promise<void> {
  await page.waitForFunction(
    needle => (document.querySelector('[id^="react-container"]')?.textContent ?? '').includes(needle),
    expected,
    { timeout: 5000 },
  );
}

/**
 * From the start of the page, one Tab: it has to land on MAIDR's figure.
 * Nothing has focus before it, as the add-in moves none on load.
 */
async function tabIntoFigure(page: Page): Promise<void> {
  await expect(page.locator(':focus')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(view(page).locator('[role="application"]')).toBeFocused();
  await waitForText(page, 'maidr plot of type: vertical bar');
}

test.describe('The published Office add-in on the slide (addin/slide.html)', () => {
  test('links the one chart on its slide, saves the link, and reads it with the keyboard from the first Tab', async ({ page }) => {
    await open(page, { selected: [256] });

    await expect(view(page).locator('[data-maidr-office-anchor]')).toHaveText('Sales');
    await expect.poll(() => seen(page)).toMatchObject({ saved: { [LINK]: { slideId: '256', shapeId: '4', name: 'Chart 3' } }, saves: 1 });
    await expect(picker(page)).toHaveValue('256:4');
    await expect(readAgain(page)).toBeVisible();
    await expect(page.locator('#maidr-waiting')).toHaveCount(0);

    await tabIntoFigure(page);
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q1, Sales is 120');
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q2, Sales is 135');
  });

  test('asks which chart when its slide has two, its slide\'s first, and links the one chosen', async ({ page }) => {
    await open(page, { selected: [257] });

    await expect(view(page).locator('[data-maidr-office-status]')).toHaveText('Choose the chart this add-in reads.');
    await expect(picker(page).locator('option')).toHaveText(['Choose a chart', 'Slide 2: Visitors', 'Slide 2: Costs', 'Slide 1: Sales']);

    await picker(page).selectOption({ label: 'Slide 2: Costs' });

    await expect(view(page).locator('[data-maidr-office-anchor]')).toHaveText('Costs');
    await expect(plot(page)).toHaveAttribute('aria-label', /maidr plot of type: vertical bar/);
    await expect.poll(() => seen(page)).toMatchObject({ saved: { [LINK]: { slideId: '257', shapeId: '5', name: 'Chart 5' } }, saves: 1 });
  });

  test('shows the chart linked, and nothing else, in the slide show', async ({ page }) => {
    await open(page, { view: 'read', settings: { [LINK]: { slideId: '257', shapeId: '4', name: 'Chart 4' } } });

    await expect(view(page).locator('[data-maidr-office-anchor]')).toHaveText('Visitors');
    await expect(page.locator('#maidr select')).toHaveCount(0);
    await expect(page.locator('#maidr button')).toHaveCount(0);
    await expect(page.locator('#maidr [data-maidr-office-progress]')).toHaveCount(0);

    await tabIntoFigure(page);
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q1, Visitors is 1200');
    expect((await seen(page)).saves).toBe(0);
  });

  test('reads the file again as the slide show starts, and brings the controls back after it', async ({ page }) => {
    await open(page, { selected: [256] });
    await expect(readAgain(page)).toBeVisible();
    await expect.poll(async () => (await seen(page)).reads).toBe(1);

    await changeView(page, 'read');

    await expect(readAgain(page)).toHaveCount(0);
    await expect(page.locator('#maidr select')).toHaveCount(0);
    await expect.poll(async () => (await seen(page)).reads).toBe(2);
    await expect(view(page).locator('[data-maidr-office-anchor]')).toHaveText('Sales');

    await changeView(page, 'edit');

    await expect(readAgain(page)).toBeVisible();
    await expect(picker(page)).toHaveValue('256:4');
  });

  test('says what it is waiting for, and after a while that PowerPoint has not answered', async ({ page }) => {
    await page.clock.install();
    await page.route(OFFICE_JS, route => route.fulfill({ contentType: 'text/javascript', body: UNANSWERED_OFFICE_JS }));

    await page.goto(PAGE);

    const waiting = page.locator('#maidr').getByRole('status');
    await expect(waiting).toHaveText('Connecting to PowerPoint…');
    await page.clock.runFor(10000);
    await expect(waiting).toHaveText(/^PowerPoint has not answered\. .*Add-ins on the Insert tab\.$/);
  });

  test('says it found no PowerPoint when Office.js cannot load', async ({ page }) => {
    await page.route(OFFICE_JS, route => route.abort());

    await page.goto(PAGE);

    await expect(view(page).locator('[data-maidr-office-status]')).toHaveText(/could not find PowerPoint/);
    await expect(page.locator('#maidr-waiting')).toHaveCount(0);
  });
});
