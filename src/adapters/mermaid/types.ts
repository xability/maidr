/**
 * The parts of Mermaid the adapter reads, typed structurally so the adapter
 * imports nothing from Mermaid itself.
 *
 * Mermaid is a peer the page already loads. Its diagram databases are
 * internal and vary by diagram type and version, so every read goes through
 * the guards in `read.ts` rather than through these types: a database that
 * has changed shape degrades to fewer details, never to a thrown error.
 */

import type { MaidrLayer } from '@type/grammar';

/** A parsed Mermaid diagram, as `mermaidAPI.getDiagramFromText` returns it. */
export interface MermaidDiagram {
  /** The diagram type Mermaid detected, such as `flowchart-v2` or `sequence`. */
  type: string;
  /** The diagram's database: what the parser read, by diagram type. */
  db: unknown;
  /** The text the diagram was parsed from. */
  text?: string;
}

/** What `mermaid.render` resolves to. */
export interface MermaidRenderResult {
  svg: string;
  bindFunctions?: (element: Element) => void;
}

/**
 * The Mermaid API the adapter calls: the global `mermaid` of the script-tag
 * build, or the default export of the `mermaid` package.
 */
export interface MermaidApi {
  mermaidAPI: {
    getDiagramFromText: (text: string) => Promise<MermaidDiagram>;
  };
  render: (id: string, text: string, container?: Element) => Promise<MermaidRenderResult>;
}

/** Options for {@link createMaidrFromMermaid} and the binding helpers. */
export interface MermaidAdapterOptions {
  /** Unique ID for the MAIDR figure. Defaults to the SVG element's id. */
  id?: string;
  /** Figure title. Defaults to the diagram's own title, when it has one. */
  title?: string;
  /** Figure subtitle. */
  subtitle?: string;
  /** Figure caption. Defaults to the diagram's accessible description. */
  caption?: string;
}

/**
 * What a diagram converter is handed: the parsed database and the rendered
 * SVG, whose elements the layers' selectors name.
 */
export interface DiagramContext {
  /** The diagram's database. Read only through the guards in `read.ts`. */
  db: unknown;
  /**
   * The diagram's text, for the one diagram whose plugin keeps no database
   * (ZenUML).
   */
  text?: string;
  /** The rendered diagram. */
  svg: SVGSVGElement;
  /** The id Mermaid prefixed the diagram's element ids with. */
  svgId: string;
  /** Makes layer ids unique within the figure. */
  layerId: (suffix: string) => string;
}

/** What a diagram converter returns: the figure's layers, and its title. */
export interface DiagramConversion {
  layers: MaidrLayer[];
  /** The title the diagram declares, when the database carries one. */
  title?: string;
}

/** Converts one Mermaid diagram type. */
export type DiagramConverter = (context: DiagramContext) => DiagramConversion;
