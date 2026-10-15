/**
 * Converts a rendered Mermaid diagram into MAIDR's schema.
 *
 * Mermaid draws a diagram from text; the adapter parses the same text with
 * Mermaid's own parser, reads the diagram's database, and pairs what it read
 * with the elements Mermaid drew. Which MAIDR layer a diagram becomes depends
 * on what it is read for:
 *
 * - boxes and arrows (flowchart, state, class, ER, requirement, use case,
 *   C4, block, architecture, git graph, event model, swimlane, agent flow)
 *   become a `directed_graph`;
 * - hierarchies (mindmap, kanban, tree view, Ishikawa, timeline, Cynefin,
 *   railroad) become a `tree`;
 * - charts become the chart they are: `pie`, `gantt` (and packet), `point`
 *   (quadrant), `bar` and `line` (XY chart), `radar`, `sankey`, `treemap`,
 *   and a user journey's scores a `line`;
 * - a sequence diagram -- Mermaid's own or ZenUML's -- becomes a `sequence`,
 *   a Venn diagram a `venn`, and a Wardley map a `point` layer of its
 *   components with a `directed_graph` of their dependencies.
 */

import type { Maidr } from '@type/grammar';
import type {
  DiagramContext,
  DiagramConversion,
  DiagramConverter,
  MermaidAdapterOptions,
  MermaidApi,
} from './types';
import { call, plain } from './read';
import { DIAGRAM_CONVERTERS } from './registry';

let figureCounter = 0;

/**
 * The title a diagram declares in its front matter, which Mermaid keeps out
 * of the diagram's database.
 *
 * @param text - The diagram's source
 * @returns The title, or undefined
 */
export function frontMatterTitle(text: string): string | undefined {
  const lines = text.trimStart().split('\n');
  if (lines[0]?.trim() !== '---') {
    return undefined;
  }
  for (const line of lines.slice(1)) {
    const trimmed = line.trim();
    if (trimmed === '---') {
      break;
    }
    if (line.startsWith('title:')) {
      const title = trimmed.slice('title:'.length).trim().replace(/^(['"])(.*)\1$/, '$2');
      return title ? plain(title) : undefined;
    }
  }
  return undefined;
}

/**
 * The Mermaid diagram types this adapter reads, as Mermaid names them.
 *
 * @returns The type names
 */
export function supportedMermaidDiagrams(): string[] {
  return Object.keys(DIAGRAM_CONVERTERS);
}

/**
 * Converts a parsed diagram against its rendered SVG.
 *
 * Separate from {@link createMaidrFromMermaid} so a caller that already holds
 * the parsed diagram -- or a test with a stand-in database -- need not parse
 * again.
 *
 * @param diagram - The parsed diagram: its type and database
 * @param diagram.type - The diagram type Mermaid detected
 * @param diagram.db - The diagram's database
 * @param diagram.text - The text it was parsed from
 * @param svg - The SVG Mermaid rendered from the same text
 * @param options - Figure options
 * @returns The MAIDR figure
 * @throws Error when the diagram type is not one the adapter reads
 */
export function convertMermaidDiagram(
  diagram: { type: string; db: unknown; text?: string },
  svg: SVGSVGElement,
  options: MermaidAdapterOptions = {},
): Maidr {
  const convert: DiagramConverter | undefined = DIAGRAM_CONVERTERS[diagram.type];
  if (convert === undefined) {
    throw new Error(
      `[maidr/mermaid] Mermaid diagram type "${diagram.type}" is not supported. `
      + `Supported: ${supportedMermaidDiagrams().join(', ')}.`,
    );
  }

  figureCounter += 1;
  if (!svg.id) {
    svg.id = `maidr-mermaid-${figureCounter}`;
  }
  const id = options.id ?? svg.id;
  const context: DiagramContext = {
    db: diagram.db,
    ...(diagram.text === undefined ? {} : { text: diagram.text }),
    svg,
    svgId: svg.id,
    layerId: suffix => `${id}-${suffix}`,
  };
  const conversion: DiagramConversion = convert(context);
  if (conversion.layers.length === 0) {
    throw new Error(`[maidr/mermaid] The ${diagram.type} diagram has nothing MAIDR can read.`);
  }

  const title = options.title
    ?? conversion.title
    ?? (plain(call(diagram.db, 'getDiagramTitle')) || plain(call(diagram.db, 'getTitle')) || undefined);
  const caption = options.caption ?? (plain(call(diagram.db, 'getAccDescription')) || undefined);
  return {
    id,
    ...(title ? { title } : {}),
    ...(options.subtitle ? { subtitle: options.subtitle } : {}),
    ...(caption ? { caption } : {}),
    subplots: [[{ layers: conversion.layers }]],
  };
}

/**
 * Creates a MAIDR figure from a Mermaid diagram that has been rendered.
 *
 * Call it after the SVG is in the page: the layers' selectors name the
 * elements Mermaid drew. The text is parsed again with Mermaid's own parser,
 * so pass exactly the text that was rendered.
 *
 * @param mermaid - The Mermaid API: the global `mermaid`, or the package's default export
 * @param text - The diagram's source text
 * @param svg - The rendered diagram
 * @param options - Figure options
 * @returns The MAIDR figure, ready for the `maidr` attribute
 * @throws Error when the text does not parse or the type is not supported
 *
 * @example
 * ```js
 * const text = 'flowchart LR\n  A[Start] --> B{OK?}\n  B -->|yes| C[Ship]';
 * const { svg } = await mermaid.render('flow', text);
 * container.innerHTML = svg;
 * const svgElement = container.querySelector('svg');
 * const maidr = await maidrMermaid.createMaidrFromMermaid(mermaid, text, svgElement);
 * svgElement.setAttribute('maidr', JSON.stringify(maidr));
 * ```
 */
export async function createMaidrFromMermaid(
  mermaid: MermaidApi,
  text: string,
  svg: SVGSVGElement,
  options: MermaidAdapterOptions = {},
): Promise<Maidr> {
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
  // Read before anything else awaits: some diagram databases are shared
  // between parses, and another diagram on the page parsing in between
  // would replace what this one read.
  const title = options.title ?? frontMatterTitle(text);
  return convertMermaidDiagram(
    { type: diagram.type, db: diagram.db, text: diagram.text ?? text },
    svg,
    title === undefined ? options : { ...options, title },
  );
}
