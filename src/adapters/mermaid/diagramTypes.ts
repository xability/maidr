/**
 * Which diagram each Mermaid diagram is, for the diagrams read as a MAIDR
 * layer type they are not.
 *
 * A diagram is read as the layer type that navigates it: a class diagram as
 * a `directed_graph`, a kanban board as a `tree`, a user journey as a `line`.
 * Named after that type, it was described as that type too: the description
 * said a class diagram was a directed graph "used to show how something is
 * computed, such as the layers of a neural network", and a kanban board a
 * tree diagram whose "lines branch out" from "one item at the top or left".
 * Neither is what Mermaid draws. Each such layer says which diagram it is
 * instead (`diagramType`), and MAIDR names it as the page and a sighted
 * reader name it, and explains it, in the reader's language.
 *
 * A diagram that is the chart its layer type names -- a pie, a gantt, an XY
 * chart's bars and line, a radar, a sankey, a treemap, a sequence or Venn
 * diagram -- keeps that type's name and its guide.
 */

import { DiagramType } from '@type/grammar';

/** Each level of C4 diagram, by the keyword Mermaid parsed. */
const C4_LEVELS = new Map<string, DiagramType>([
  ['C4Context', DiagramType.C4_CONTEXT],
  ['C4Container', DiagramType.C4_CONTAINER],
  ['C4Component', DiagramType.C4_COMPONENT],
  ['C4Dynamic', DiagramType.C4_DYNAMIC],
  ['C4Deployment', DiagramType.C4_DEPLOYMENT],
]);

/**
 * A C4 diagram, named for its level: a `C4Context` diagram is a C4 Context
 * Diagram, as the C4 model and Mermaid's documentation name it.
 *
 * @param level - The keyword the diagram was written with, as Mermaid keeps it
 * @returns The diagram's type, a plain C4 diagram for a level it does not know
 */
export function c4DiagramType(level: string | undefined): DiagramType {
  return C4_LEVELS.get(level ?? '') ?? DiagramType.C4;
}
