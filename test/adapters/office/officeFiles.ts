/**
 * Builds the files the Office adapter reads, part by part, as PowerPoint and
 * Word write them: a presentation's slides, chart frames and relationships,
 * and a document's flat package with its chart drawings.
 */

import { axIds, catAx, chartExSpace, chartSpace, numRef, ser, strRef, valAx } from './chartXml';
import { zipFiles } from './zipFixture';

export const NS = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  wps: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
  pkg: 'http://schemas.microsoft.com/office/2006/xmlPackage',
};
export const CHART_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';
export const CHARTEX_TYPE = 'http://schemas.microsoft.com/office/2014/relationships/chartEx';
export const SLIDE_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
export const DOCUMENT_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';

export function rels(...links: [id: string, type: string, target: string, external?: boolean][]): string {
  return `<?xml version="1.0"?><Relationships xmlns="${NS.rel}">${links
    .map(([id, type, target, external]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"${external === true ? ' TargetMode="External"' : ''}/>`)
    .join('')}</Relationships>`;
}

/** A chart frame on a slide, as PowerPoint writes one. */
export function frame(id: number, name: string, rid: string, options: { ex?: boolean; descr?: string } = {}): string {
  const uri = options.ex === true
    ? 'http://schemas.microsoft.com/office/drawing/2014/chartex'
    : 'http://schemas.openxmlformats.org/drawingml/2006/chart';
  const reference = options.ex === true
    ? `<cx:chart xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" r:id="${rid}"/>`
    : `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/>`;
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${name}"${options.descr === undefined ? '' : ` descr="${options.descr}"`}/>`
    + `<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="1" cy="1"/></p:xfrm>`
    + `<a:graphic><a:graphicData uri="${uri}">${reference}</a:graphicData></a:graphic></p:graphicFrame>`;
}

export function slide(shapes: string, hidden = false): string {
  return `<?xml version="1.0"?><p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:mc="${NS.mc}"${hidden ? ' show="0"' : ''}>`
    + `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld></p:sld>`;
}

/** A one-series column chart part. */
export function columnChart(name: string, values: readonly number[] = [1, 2]): string {
  return chartSpace(`<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${
    ser({ idx: 0, name, cat: strRef(['A', 'B']), val: numRef(values) })
  }${axIds(1, 2)}</c:barChart>${catAx({ id: 1, cross: 2 })}${valAx({ id: 2, cross: 1 })}`);
}

/** A waterfall chart part, of the types Office 2016 added. */
export const WATERFALL = chartExSpace([{ categories: [['Start', 'End']], values: [10, 12] }], [{ layoutId: 'waterfall', name: 'Cash' }], { title: 'Cash flow' });

/** A flat package as Word's `getOoxml` returns one. */
export function flatPackage(parts: Record<string, string>): string {
  return `<?xml version="1.0" standalone="yes"?><?mso-application progid="Word.Document"?><pkg:package xmlns:pkg="${NS.pkg}">${Object.entries(parts)
    .map(([name, xml]) => `<pkg:part pkg:name="${name}" pkg:contentType="application/xml"><pkg:xmlData>${xml.replace(/^<\?xml[^>]*\?>/, '')}</pkg:xmlData></pkg:part>`)
    .join('')}</pkg:package>`;
}

/** An inline chart drawing in a Word paragraph. */
export function drawing(id: number, name: string, rid: string, options: { ex?: boolean; descr?: string } = {}): string {
  const uri = options.ex === true
    ? 'http://schemas.microsoft.com/office/drawing/2014/chartex'
    : 'http://schemas.openxmlformats.org/drawingml/2006/chart';
  const reference = options.ex === true
    ? `<cx:chart xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" r:id="${rid}"/>`
    : `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/>`;
  return `<w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="${id}" name="${name}"${options.descr === undefined ? '' : ` descr="${options.descr}"`}/>`
    + `<a:graphic xmlns:a="${NS.a}"><a:graphicData uri="${uri}">${reference}</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

/** A presentation of one chart per slide, each slide's chart named in order. */
export async function deck(charts: readonly { readonly name: string; readonly part: string }[]): Promise<Uint8Array> {
  const files: Record<string, string> = {
    '_rels/.rels': rels(['rId1', DOCUMENT_TYPE, 'ppt/presentation.xml']),
    'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation xmlns:p="${NS.p}" xmlns:r="${NS.r}"><p:sldIdLst>${charts
      .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`)
      .join('')}</p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels(...charts.map((_, i): [string, string, string] => [`rId${i + 1}`, SLIDE_TYPE, `slides/slide${i + 1}.xml`])),
  };
  charts.forEach((chart, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = slide(frame(4, chart.name, 'rId2'));
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = rels(['rId2', CHART_TYPE, `../charts/chart${i + 1}.xml`]);
    files[`ppt/charts/chart${i + 1}.xml`] = chart.part;
  });
  return zipFiles(files);
}

/** A Word document of chart drawings, each with its part, as `getOoxml` returns it. */
export function wordDocument(charts: readonly { readonly id: number; readonly name: string; readonly part: string }[]): string {
  const body = `<w:document xmlns:w="${NS.w}" xmlns:wp="${NS.wp}" xmlns:r="${NS.r}"><w:body>${charts
    .map((chart, i) => `<w:p>${drawing(chart.id, chart.name, `rId${i + 1}`)}</w:p>`)
    .join('')}</w:body></w:document>`;
  const parts: Record<string, string> = {
    '/_rels/.rels': rels(['rId1', DOCUMENT_TYPE, 'word/document.xml']),
    '/word/document.xml': body,
    '/word/_rels/document.xml.rels': rels(...charts.map((_, i): [string, string, string] => [`rId${i + 1}`, CHART_TYPE, `charts/chart${i + 1}.xml`])),
  };
  charts.forEach((chart, i) => {
    parts[`/word/charts/chart${i + 1}.xml`] = chart.part;
  });
  return flatPackage(parts);
}
