/**
 * @jest-environment jsdom
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';

/**
 * The Office add-ins MAIDR publishes (`addin/`) are manifests Office reads
 * from the user's machine, pointing at files the documentation site serves:
 * the task pane (`manifest.xml`) and the add-in on the slide
 * (`slide-manifest.xml`). A wrong URL, an icon of the wrong size or a `resid`
 * naming nothing does not fail any build: Office refuses the add-in, or shows
 * it without its button, on the day someone installs it. These checks catch
 * that offline; Microsoft's validation service
 * (`npx office-addin-manifest validate`) checks the schema.
 */

const ROOT = path.resolve(__dirname, '../..');
const ADDIN = path.join(ROOT, 'addin');
const SITE = 'https://maidr.ai/';

const OFFICE_APP = 'http://schemas.microsoft.com/office/appforoffice/1.1';
const OVERRIDES = 'http://schemas.microsoft.com/office/taskpaneappversionoverrides';
const BASIC = 'http://schemas.microsoft.com/office/officeappbasictypes/1.0';
const XSI = 'http://www.w3.org/2001/XMLSchema-instance';

/** An add-in id: a version 4 GUID, as Office's tools make one. */
const GUID = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;

/**
 * The order the schema keeps a content add-in's elements in, those it may
 * leave out included. `VersionOverrides` is not among them on purpose: the
 * add-in on the slide has no button, and is inserted from Add-ins on the
 * Home tab.
 */
const CONTENT_APP_ORDER = [
  'Id',
  'AlternateId',
  'Version',
  'ProviderName',
  'DefaultLocale',
  'DisplayName',
  'Description',
  'IconUrl',
  'HighResolutionIconUrl',
  'SupportUrl',
  'AppDomains',
  'Hosts',
  'Requirements',
  'DefaultSettings',
  'Permissions',
  'AllowSnapshot',
];

function manifest(file = 'manifest.xml'): Document {
  const document = new DOMParser().parseFromString(readFileSync(path.join(ADDIN, file), 'utf8'), 'application/xml');
  expect(document.getElementsByTagName('parsererror')).toHaveLength(0);
  return document;
}

function all(document: Document, ns: string, local: string): Element[] {
  return Array.from(document.getElementsByTagNameNS(ns, local));
}

function value(document: Document, local: string): string {
  return all(document, OFFICE_APP, local)[0]?.getAttribute('DefaultValue') ?? '';
}

/** The file of `addin/` a URL on the site names, or `undefined` for a URL elsewhere. */
function addinFile(url: string): string | undefined {
  const prefix = `${SITE}addin/`;
  return url.startsWith(prefix) ? path.join(ADDIN, url.slice(prefix.length)) : undefined;
}

/** A PNG's width and height, from its header. */
function pngSize(file: string): [number, number] {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

/**
 * Every URL the manifest gives: its own, and its resources' -- not the
 * references to them inside each Icon.
 */
function urls(document: Document): string[] {
  return [
    ...['IconUrl', 'HighResolutionIconUrl', 'SupportUrl', 'SourceLocation'].map(local => value(document, local)),
    ...[...all(document, BASIC, 'Image'), ...all(document, BASIC, 'Url')]
      .filter(element => element.hasAttribute('DefaultValue'))
      .map(element => element.getAttribute('DefaultValue') ?? ''),
  ];
}

/** Every icon the manifest gives, as its name, the size it is declared at and the size it is. */
function iconSizes(document: Document): [string, number, [number, number]][] {
  const images = resources(document);
  return [
    ['IconUrl', 32, pngSize(addinFile(value(document, 'IconUrl')) ?? '')],
    ['HighResolutionIconUrl', 64, pngSize(addinFile(value(document, 'HighResolutionIconUrl')) ?? '')],
    ...all(document, BASIC, 'Image')
      .filter(image => image.hasAttribute('size'))
      .map((image): [string, number, [number, number]] => {
        const resource = images.get(image.getAttribute('resid') ?? '');
        return [image.getAttribute('resid') ?? '', Number(image.getAttribute('size')), pngSize(addinFile(resource?.getAttribute('DefaultValue') ?? '') ?? '')];
      }),
  ];
}

/** Every resource the manifest defines, by id. */
function resources(document: Document): Map<string, Element> {
  const out = new Map<string, Element>();
  for (const local of ['Image', 'Url', 'String']) {
    for (const element of all(document, BASIC, local)) {
      const id = element.getAttribute('id');
      if (id !== null) {
        out.set(id, element);
      }
    }
  }
  return out;
}

describe('addin/manifest.xml', () => {
  it('should be a task pane add-in for Excel, PowerPoint and Word, with a lasting id', () => {
    const document = manifest();
    const root = document.documentElement;

    expect(root.localName).toBe('OfficeApp');
    expect(root.getAttributeNS(XSI, 'type')).toBe('TaskPaneApp');
    expect(all(document, OFFICE_APP, 'Id')[0]?.textContent).toMatch(GUID);
    expect(all(document, OFFICE_APP, 'Version')[0]?.textContent).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(all(document, OFFICE_APP, 'Host').map(host => host.getAttribute('Name'))).toEqual(['Workbook', 'Presentation', 'Document']);
    expect(all(document, OVERRIDES, 'Host').map(host => host.getAttributeNS(XSI, 'type'))).toEqual(['Workbook', 'Presentation', 'Document']);
    expect(all(document, OFFICE_APP, 'Permissions')[0]?.textContent).toBe('ReadWriteDocument');
  });

  it('should point only at the site, and at files the site serves', () => {
    const document = manifest();
    const given = urls(document);

    const offSite = given.filter(url => !url.startsWith(SITE));
    const missing = given.map(addinFile).filter((file): file is string => file !== undefined && !existsSync(file));

    expect(offSite).toEqual([]);
    expect(missing).toEqual([]);
    // The support page is the add-in's guide, which the site builds from docs/.
    expect(value(document, 'SupportUrl')).toBe(`${SITE}office-addin.html`);
    expect(existsSync(path.join(ROOT, 'docs', 'office-addin.md'))).toBe(true);
  });

  it('should declare every icon at the size it is', () => {
    const sizes = iconSizes(manifest());

    expect(sizes.filter(([, size, [width, height]]) => width !== size || height !== size)).toEqual([]);
  });

  it('should define every resource it names, and name every one it defines', () => {
    const document = manifest();
    const defined = resources(document);
    const named = new Set(Array.from(document.getElementsByTagName('*')).map(element => element.getAttribute('resid')).filter((id): id is string => id !== null));

    expect([...named].filter(id => !defined.has(id))).toEqual([]);
    expect([...defined.keys()].filter(id => !named.has(id))).toEqual([]);
  });

  it('should keep its strings within Office\'s limits', () => {
    const document = manifest();
    const short = all(document, BASIC, 'ShortStrings').flatMap(list => Array.from(list.children));
    const long = all(document, BASIC, 'LongStrings').flatMap(list => Array.from(list.children));

    expect(value(document, 'DisplayName').length).toBeLessThanOrEqual(125);
    expect(value(document, 'Description').length).toBeLessThanOrEqual(250);
    expect(short.filter(string => (string.getAttribute('DefaultValue') ?? '').length > 125)).toEqual([]);
    expect(long.filter(string => (string.getAttribute('DefaultValue') ?? '').length > 250)).toEqual([]);
  });
});

describe('addin/taskpane.html', () => {
  it('should load Office.js from Microsoft\'s CDN and MAIDR from the site, and bind every application', () => {
    const page = readFileSync(path.join(ADDIN, 'taskpane.html'), 'utf8');

    expect(page).toContain('<script src="https://officeapis.public.onecdn.static.microsoft/1/office.js"></script>');
    expect(page).toContain('<script src="../dist/maidr.js"></script>');
    expect(page).toContain('<script src="../dist/office.js"></script>');
    expect(page).toContain('maidrOffice.bindOffice(');
  });
});

describe('addin/slide-manifest.xml', () => {
  it('should be a content add-in for PowerPoint alone, with a lasting id of its own', () => {
    const document = manifest('slide-manifest.xml');
    const root = document.documentElement;
    const id = all(document, OFFICE_APP, 'Id')[0]?.textContent;

    expect(root.localName).toBe('OfficeApp');
    expect(root.getAttributeNS(XSI, 'type')).toBe('ContentApp');
    expect(id).toMatch(GUID);
    expect(id).not.toBe(all(manifest(), OFFICE_APP, 'Id')[0]?.textContent);
    expect(all(document, OFFICE_APP, 'Version')[0]?.textContent).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(all(document, OFFICE_APP, 'Host').map(host => host.getAttribute('Name'))).toEqual(['Presentation']);
    expect(all(document, OFFICE_APP, 'Permissions')[0]?.textContent).toBe('ReadWriteDocument');
    expect(all(document, OFFICE_APP, 'AllowSnapshot')[0]?.textContent).toBe('true');
  });

  it('should keep its elements in the order the schema requires, with no button', () => {
    const document = manifest('slide-manifest.xml');
    const names = Array.from(document.documentElement.children).map(element => element.localName);
    const settings = all(document, OFFICE_APP, 'DefaultSettings')[0];

    expect(names.filter(name => !CONTENT_APP_ORDER.includes(name))).toEqual([]);
    expect(names).toEqual([...names].sort((a, b) => CONTENT_APP_ORDER.indexOf(a) - CONTENT_APP_ORDER.indexOf(b)));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(['Id', 'Version', 'ProviderName', 'DefaultLocale', 'DisplayName', 'Description', 'DefaultSettings', 'Permissions']));
    expect(Array.from(settings?.children ?? []).map(element => element.localName)).toEqual(['SourceLocation', 'RequestedWidth', 'RequestedHeight']);
  });

  it('should ask for a size Office allows', () => {
    const document = manifest('slide-manifest.xml');
    const sizes = ['RequestedWidth', 'RequestedHeight'].map(local => all(document, OFFICE_APP, local)[0]?.textContent ?? '');

    expect(sizes.filter(size => !/^\d+$/.test(size) || Number(size) < 32 || Number(size) > 1000)).toEqual([]);
  });

  it('should point only at the site, and at files the site serves', () => {
    const document = manifest('slide-manifest.xml');
    const given = urls(document);

    const offSite = given.filter(url => !url.startsWith(SITE));
    const missing = given.map(addinFile).filter((file): file is string => file !== undefined && !existsSync(file));

    expect(offSite).toEqual([]);
    expect(missing).toEqual([]);
    expect(value(document, 'SourceLocation')).toBe(`${SITE}addin/slide.html`);
    expect(value(document, 'SupportUrl')).toBe(`${SITE}office-addin.html`);
  });

  it('should declare every icon at the size it is', () => {
    const sizes = iconSizes(manifest('slide-manifest.xml'));

    expect(sizes.filter(([, size, [width, height]]) => width !== size || height !== size)).toEqual([]);
  });

  it('should keep its strings within Office\'s limits', () => {
    const document = manifest('slide-manifest.xml');

    expect(value(document, 'DisplayName').length).toBeLessThanOrEqual(125);
    expect(value(document, 'Description').length).toBeLessThanOrEqual(250);
  });
});

describe('addin/slide.html', () => {
  it('should load Office.js from Microsoft\'s CDN and MAIDR from the site, and bind the chart on the slide', () => {
    const page = readFileSync(path.join(ADDIN, 'slide.html'), 'utf8');

    expect(page).toContain('<script src="https://officeapis.public.onecdn.static.microsoft/1/office.js"></script>');
    expect(page).toContain('<script src="../dist/maidr.js"></script>');
    expect(page).toContain('<script src="../dist/office.js"></script>');
    expect(page).toContain('maidrOffice.bindSlideChart(');
  });

  it('should leave the first Tab stop to the chart: a named main region, and no heading, link or control of its own', () => {
    const page = new DOMParser().parseFromString(readFileSync(path.join(ADDIN, 'slide.html'), 'utf8'), 'text/html');

    expect(page.querySelector('main')?.getAttribute('aria-label')).toBeTruthy();
    expect(Array.from(page.body.querySelectorAll('h1, h2, h3, h4, h5, h6, a[href], button, input, select, textarea, [tabindex]'))).toEqual([]);
  });
});
