import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * E2E coverage for the Office add-in MAIDR publishes: addin/taskpane.html,
 * the page addin/manifest.xml points Excel, PowerPoint and Word at.
 *
 * The page loads Office.js from Microsoft's CDN, as an add-in must. Here that
 * request is answered with a stand-in for Office.js in Word, holding a
 * document of one chart, so the page's own wiring -- the bundles it loads, its
 * bindOffice call, and what it says while Office has not answered -- is what
 * is driven. The panes themselves are covered by office.spec.ts and
 * excel.spec.ts.
 *
 * Requires a built bundle (dist/maidr.js, dist/office.js), like every spec.
 */

const PAGE = 'addin/taskpane.html';
const OFFICE_JS = 'https://officeapis.public.onecdn.static.microsoft/1/office.js';

/** A Word document of one column chart, as `Body.getOoxml` returns it. */
const DOCUMENT = [
  '<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">',
  '<pkg:part pkg:name="/_rels/.rels"><pkg:xmlData><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
  '</Relationships></pkg:xmlData></pkg:part>',
  '<pkg:part pkg:name="/word/document.xml"><pkg:xmlData>',
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
  '<w:body><w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Chart 1"/>',
  '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">',
  '<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId5"/></a:graphicData></a:graphic>',
  '</wp:inline></w:drawing></w:r></w:p></w:body></w:document></pkg:xmlData></pkg:part>',
  '<pkg:part pkg:name="/word/_rels/document.xml.rels"><pkg:xmlData><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart1.xml"/>',
  '</Relationships></pkg:xmlData></pkg:part>',
  '<pkg:part pkg:name="/word/charts/chart1.xml"><pkg:xmlData>',
  '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
  '<c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>Sales</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea>',
  '<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:ser><c:idx val="0"/><c:order val="0"/>',
  '<c:tx><c:v>Sales</c:v></c:tx>',
  '<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$3</c:f><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt></c:strCache></c:strRef></c:cat>',
  '<c:val><c:numRef><c:f>Sheet1!$B$2:$B$3</c:f><c:numCache><c:ptCount val="2"/><c:pt idx="0"><c:v>120</c:v></c:pt><c:pt idx="1"><c:v>135</c:v></c:pt></c:numCache></c:numRef></c:val>',
  '</c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>',
  '</pkg:xmlData></pkg:part></pkg:package>',
].join('');

/** A stand-in for Office.js in Word, serving {@link DOCUMENT}. */
const FAKE_OFFICE_JS = `
  const succeeded = value => ({ status: 'succeeded', value });
  const info = { host: 'Word', platform: 'OfficeOnline' };
  window.Office = {
    context: {
      host: 'Word',
      platform: 'OfficeOnline',
      requirements: { isSetSupported: name => name === 'WordApi' },
      document: {
        addHandlerAsync: (type, handler, callback) => callback && callback(succeeded()),
        removeHandlerAsync: (type, options, callback) => callback && callback(succeeded()),
      },
    },
    onReady(callback) {
      if (callback) callback(info);
      return Promise.resolve(info);
    },
  };
  window.Word = {
    run: async batch => batch({
      document: {
        body: { getOoxml: () => ({ value: ${JSON.stringify(DOCUMENT)} }) },
        getSelection: () => ({ getOoxml: () => ({ value: '' }) }),
      },
      sync: async () => undefined,
    }),
  };
`;

/**
 * Office.js as Microsoft's copy behaves on a page opened outside Office: it
 * loads, and `Office.onReady` never calls back.
 */
const UNANSWERED_OFFICE_JS = `
  window.Office = {
    onReady: () => new Promise(() => {}),
  };
`;

async function open(page: Page): Promise<void> {
  await page.goto(PAGE);
}

test.describe('The published Office add-in: its task pane (addin/taskpane.html)', () => {
  test('mounts the pane for the application that opened it, and reads its charts', async ({ page }) => {
    await page.route(OFFICE_JS, route => route.fulfill({ contentType: 'text/javascript', body: FAKE_OFFICE_JS }));

    await open(page);

    // Exactly: the figure is a group named by its chart, `Chart 1: Sales`.
    const picker = page.locator('#maidr').getByLabel('Chart', { exact: true });
    await expect(picker.locator('option')).toHaveText(['Chart 1: Sales']);
    await expect(page.locator('#maidr [data-maidr-office-view] [tabindex="0"]').first())
      .toHaveAttribute('aria-label', /maidr plot of type: vertical bar/);
    await expect(page.locator('#maidr').getByRole('button', { name: 'Read again' })).toBeVisible();
    await expect(page.locator('#maidr-waiting')).toHaveCount(0);
  });

  test('says what it is waiting for, and after a while that Office has not answered', async ({ page }) => {
    await page.clock.install();
    await page.route(OFFICE_JS, route => route.fulfill({ contentType: 'text/javascript', body: UNANSWERED_OFFICE_JS }));

    await open(page);

    const waiting = page.locator('#maidr').getByRole('status');
    await expect(waiting).toHaveText('Connecting to Excel, PowerPoint or Word…');
    await page.clock.runFor(10000);
    await expect(waiting).toHaveText(/^Excel, PowerPoint or Word has not answered\. .*Accessible Charts button on the Home tab\.$/);
  });

  test('says it found no file to read when Office.js cannot load', async ({ page }) => {
    await page.route(OFFICE_JS, route => route.abort());

    await open(page);

    await expect(page.locator('#maidr [data-maidr-office-status]')).toHaveText(/could not find Excel, PowerPoint or Word/);
    await expect(page.locator('#maidr-waiting')).toHaveCount(0);
  });
});
