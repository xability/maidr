/**
 * @jest-environment jsdom
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';

/**
 * The Office add-in MAIDR publishes (`addin/`) is a manifest Office reads from
 * the user's machine, pointing at files the documentation site serves. A
 * wrong URL, an icon of the wrong size or a `resid` naming nothing does not
 * fail any build: Office refuses the add-in, or shows it without its button,
 * on the day someone installs it. These checks catch that offline; Microsoft's
 * validation service (`npx office-addin-manifest validate`) checks the schema.
 */

const ROOT = path.resolve(__dirname, '../..');
const ADDIN = path.join(ROOT, 'addin');
const SITE = 'https://maidr.ai/';

const OFFICE_APP = 'http://schemas.microsoft.com/office/appforoffice/1.1';
const OVERRIDES = 'http://schemas.microsoft.com/office/taskpaneappversionoverrides';
const BASIC = 'http://schemas.microsoft.com/office/officeappbasictypes/1.0';
const XSI = 'http://www.w3.org/2001/XMLSchema-instance';

function manifest(): Document {
  const document = new DOMParser().parseFromString(readFileSync(path.join(ADDIN, 'manifest.xml'), 'utf8'), 'application/xml');
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
    expect(all(document, OFFICE_APP, 'Id')[0]?.textContent).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(all(document, OFFICE_APP, 'Version')[0]?.textContent).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(all(document, OFFICE_APP, 'Host').map(host => host.getAttribute('Name'))).toEqual(['Workbook', 'Presentation', 'Document']);
    expect(all(document, OVERRIDES, 'Host').map(host => host.getAttributeNS(XSI, 'type'))).toEqual(['Workbook', 'Presentation', 'Document']);
    expect(all(document, OFFICE_APP, 'Permissions')[0]?.textContent).toBe('ReadWriteDocument');
  });

  it('should point only at the site, and at files the site serves', () => {
    const document = manifest();
    const urls = [
      ...['IconUrl', 'HighResolutionIconUrl', 'SupportUrl', 'SourceLocation'].map(local => value(document, local)),
      // The resources, not the references to them inside each Icon.
      ...[...all(document, BASIC, 'Image'), ...all(document, BASIC, 'Url')]
        .filter(element => element.hasAttribute('DefaultValue'))
        .map(element => element.getAttribute('DefaultValue') ?? ''),
    ];

    const offSite = urls.filter(url => !url.startsWith(SITE));
    const missing = urls.map(addinFile).filter((file): file is string => file !== undefined && !existsSync(file));

    expect(offSite).toEqual([]);
    expect(missing).toEqual([]);
    // The support page is the add-in's guide, which the site builds from docs/.
    expect(value(document, 'SupportUrl')).toBe(`${SITE}office-addin.html`);
    expect(existsSync(path.join(ROOT, 'docs', 'office-addin.md'))).toBe(true);
  });

  it('should declare every icon at the size it is', () => {
    const document = manifest();
    const images = resources(document);

    const sizes: [string, number, [number, number]][] = [
      ['IconUrl', 32, pngSize(addinFile(value(document, 'IconUrl')) ?? '')],
      ['HighResolutionIconUrl', 64, pngSize(addinFile(value(document, 'HighResolutionIconUrl')) ?? '')],
      ...all(document, BASIC, 'Image')
        .filter(image => image.hasAttribute('size'))
        .map((image): [string, number, [number, number]] => {
          const resource = images.get(image.getAttribute('resid') ?? '');
          return [image.getAttribute('resid') ?? '', Number(image.getAttribute('size')), pngSize(addinFile(resource?.getAttribute('DefaultValue') ?? '') ?? '')];
        }),
    ];

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
