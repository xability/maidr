/**
 * Finds the charts of a PowerPoint presentation or a Word document, in the
 * order a reader meets them, and reads each one.
 *
 * Both are Open XML packages: parts linked by relationships. A presentation
 * lists its slides in order, each slide's chart frames name a chart part by
 * relationship, and the part is read by `./chart` or `./chartex`. A document's
 * body holds its drawings in reading order, and a chart drawing names its part
 * the same way. A presentation comes as the zip file Office.js hands over
 * (`./zip`); a document as the flat XML package Word's `getOoxml` returns,
 * every part inline.
 */

import type { ExcelChartSnapshot } from '../excel/types';
import type { ZipArchive } from './zip';
import { readChartPart } from './chart';
import { readChartExPart } from './chartex';
import { CHART_URI, CHARTEX_URI, child, children, descendants, NS, parseXml, path } from './xml';

/** One chart of a presentation or a document. */
export interface OfficeChart {
  /**
   * Unique in the file, and kept across reads of it: `<slide id>:<shape id>`
   * in a presentation, the drawing's id in a document.
   */
  readonly id: string;
  /**
   * Where the chart is: its slide's number in a presentation, from 1; in a
   * document, its own number among the document's charts, from 1.
   */
  readonly position: number;
  /** The frame's name, such as `Chart 3`. */
  readonly name: string;
  /** The alternative text the author gave the chart, if any. */
  readonly description?: string;
  /** A presentation's slide id, `p:sldId/@id`. */
  readonly slideId?: string;
  /** A presentation's shape id, unique on its slide, `p:cNvPr/@id`. */
  readonly shapeId?: string;
  /** Whether the chart is on a slide hidden from the slide show. */
  readonly hidden?: boolean;
  /** The chart, read; `null` when its part is missing or cannot be read. */
  readonly snapshot: ExcelChartSnapshot | null;
}

/** The parts of a package, by name, as parsed XML. */
interface Parts {
  /** A part's root element, or `null` when there is no such part or it is not XML. */
  xml: (name: string) => Promise<Element | null>;
}

const OFFICE_DOCUMENT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';

/** A part's name without a leading slash, its segments resolved. */
function normalize(name: string): string {
  const out: string[] = [];
  for (const segment of name.split('/')) {
    if (segment === '..') {
      out.pop();
    } else if (segment !== '.' && segment !== '') {
      out.push(segment);
    }
  }
  return out.join('/');
}

/** Where a part's relationships are: `dir/_rels/name.rels`. */
function relsName(part: string): string {
  const at = part.lastIndexOf('/');
  return `${part.slice(0, at + 1)}_rels/${part.slice(at + 1)}.rels`;
}

/** A relationship's target, resolved against the part it is from. */
function resolve(part: string, target: string): string {
  if (target.startsWith('/')) {
    return normalize(target);
  }
  return normalize(`${part.slice(0, part.lastIndexOf('/') + 1)}${target}`);
}

/** A part's internal relationships: id to target part and type. */
async function relationships(parts: Parts, part: string): Promise<Map<string, { target: string; type: string }>> {
  const out = new Map<string, { target: string; type: string }>();
  const root = await parts.xml(relsName(part));
  for (const relationship of children(root, NS.rel, 'Relationship')) {
    if (relationship.getAttribute('TargetMode') === 'External') {
      continue;
    }
    out.set(relationship.getAttribute('Id') ?? '', {
      target: resolve(part, relationship.getAttribute('Target') ?? ''),
      type: relationship.getAttribute('Type') ?? '',
    });
  }
  return out;
}

/** The package's main part: what its root relationships call the office document. */
async function mainPart(parts: Parts, fallback: string): Promise<string> {
  for (const [, { target, type }] of await relationships(parts, '')) {
    if (type === OFFICE_DOCUMENT) {
      return target;
    }
  }
  return fallback;
}

/** The chart a frame's `a:graphicData` holds: its relationship id, and whether it is a chartEx part. */
function chartReference(graphicData: Element | null): { id: string; ex: boolean } | null {
  const uri = graphicData?.getAttribute('uri');
  if (graphicData === null || (uri !== CHART_URI && uri !== CHARTEX_URI)) {
    return null;
  }
  const ex = uri === CHARTEX_URI;
  const reference = child(graphicData, ex ? NS.cx : NS.c, 'chart');
  const id = reference?.getAttributeNS(NS.r, 'id') ?? '';
  return id === '' ? null : { id, ex };
}

/** Read a chart part; `null` when it is missing or is not a chart. */
async function readChart(parts: Parts, name: string | undefined, ex: boolean): Promise<ExcelChartSnapshot | null> {
  if (name === undefined) {
    return null;
  }
  const root = await parts.xml(name);
  if (root === null) {
    return null;
  }
  return ex ? readChartExPart(root) : readChartPart(root);
}

/** The attributes of a frame's non-visual properties: id, name, alternative text. */
function describe(properties: Element | null): { id: string; name: string; description?: string } {
  const description = properties?.getAttribute('descr')?.trim() || properties?.getAttribute('title')?.trim();
  return {
    id: properties?.getAttribute('id') ?? '',
    name: properties?.getAttribute('name')?.trim() || 'Chart',
    ...(description === undefined || description === '' ? {} : { description }),
  };
}

/**
 * The charts of a presentation, slide by slide in the order of the slide
 * show, each slide's in the order its shapes are drawn.
 *
 * @param zip - The presentation file.
 * @returns Its charts; a chart whose part cannot be read has a `null` snapshot.
 */
export async function readPresentationCharts(zip: ZipArchive): Promise<OfficeChart[]> {
  const parts: Parts = {
    xml: async (name: string): Promise<Element | null> => {
      const text = await zip.text(name);
      return text === undefined ? null : parseXml(text)?.documentElement ?? null;
    },
  };
  const presentation = await mainPart(parts, 'ppt/presentation.xml');
  const root = await parts.xml(presentation);
  const links = await relationships(parts, presentation);
  const charts: OfficeChart[] = [];
  const slideIds = children(path(root, NS.p, 'sldIdLst'), NS.p, 'sldId');
  for (const [i, slideId] of slideIds.entries()) {
    const slide = links.get(slideId.getAttributeNS(NS.r, 'id') ?? '')?.target;
    if (slide === undefined) {
      continue;
    }
    const slideRoot = await parts.xml(slide);
    if (slideRoot === null) {
      continue;
    }
    const slideLinks = await relationships(parts, slide);
    const hidden = slideRoot.getAttribute('show') === '0';
    for (const frame of descendants(slideRoot, NS.p, 'graphicFrame')) {
      const reference = chartReference(path(frame, NS.a, 'graphic', 'graphicData'));
      if (reference === null) {
        continue;
      }
      const { id: shapeId, name, description } = describe(path(frame, NS.p, 'nvGraphicFramePr', 'cNvPr'));
      const id = slideId.getAttribute('id') ?? String(i + 1);
      charts.push({
        id: `${id}:${shapeId}`,
        position: i + 1,
        name,
        ...(description === undefined ? {} : { description }),
        slideId: id,
        shapeId,
        ...(hidden ? { hidden } : {}),
        snapshot: await readChart(parts, slideLinks.get(reference.id)?.target, reference.ex),
      });
    }
  }
  return charts;
}

/**
 * The parts of a flat package (`pkg:package`), as Word's `getOoxml` returns
 * one: each `pkg:part` by name, with its XML inline.
 */
function flatParts(text: string): Parts | null {
  const document = parseXml(text);
  const root = document?.documentElement;
  if (root === null || root === undefined || root.namespaceURI !== NS.pkg || root.localName !== 'package') {
    return null;
  }
  const byName = new Map<string, Element>();
  for (const part of children(root, NS.pkg, 'part')) {
    const data = child(part, NS.pkg, 'xmlData');
    const element = data?.firstElementChild ?? null;
    const name = part.getAttributeNS(NS.pkg, 'name') ?? '';
    if (element !== null && name !== '') {
      byName.set(normalize(name).toLowerCase(), element);
    }
  }
  return { xml: async (name: string): Promise<Element | null> => byName.get(normalize(name).toLowerCase()) ?? null };
}

/**
 * The charts of a Word document, in reading order, from the flat package
 * `Body.getOoxml` (or `Range.getOoxml`) returns.
 *
 * @param text - The flat package.
 * @returns Its charts; a chart whose part cannot be read has a `null`
 * snapshot. Nothing, when the text is not a flat package.
 */
export async function readDocumentCharts(text: string): Promise<OfficeChart[]> {
  const parts = flatParts(text);
  if (parts === null) {
    return [];
  }
  const main = await mainPart(parts, 'word/document.xml');
  const body = await parts.xml(main);
  if (body === null) {
    return [];
  }
  const links = await relationships(parts, main);
  const charts: OfficeChart[] = [];
  for (const graphicData of descendants(body, NS.a, 'graphicData')) {
    const reference = chartReference(graphicData);
    if (reference === null) {
      continue;
    }
    // `wp:inline` or `wp:anchor`, whose `wp:docPr` names the drawing.
    const holder = graphicData.parentElement?.parentElement ?? null;
    const { id, name, description } = describe(child(holder, NS.wp, 'docPr'));
    charts.push({
      id: id === '' ? `chart-${charts.length + 1}` : id,
      position: charts.length + 1,
      name,
      ...(description === undefined ? {} : { description }),
      snapshot: await readChart(parts, links.get(reference.id)?.target, reference.ex),
    });
  }
  return charts;
}
