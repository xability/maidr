/**
 * Which converter reads which Mermaid diagram type, keyed by the type name
 * Mermaid's detector gives the diagram.
 */

import type { DiagramConverter } from './types';
import * as charts from './diagrams/charts';
import * as graphs from './diagrams/graphs';
import * as hierarchies from './diagrams/hierarchies';
import * as interactions from './diagrams/interactions';
import * as unified from './diagrams/unified';
import { zenuml } from './diagrams/zenuml';

export const DIAGRAM_CONVERTERS: Record<string, DiagramConverter> = {
  // Boxes and arrows.
  'flowchart': unified.flowchart,
  'flowchart-v2': unified.flowchart,
  'flowchart-elk': unified.flowchart,
  'graph': unified.flowchart,
  'swimlane': unified.swimlane,
  'agentflow': unified.agentflow,
  'stateDiagram': unified.state,
  'state': unified.state,
  'classDiagram': unified.classDiagram,
  'class': unified.classDiagram,
  'er': unified.entityRelationship,
  'requirement': unified.requirement,
  'usecase': unified.usecase,
  'c4': graphs.c4,
  'block': graphs.block,
  'architecture': graphs.architecture,
  'gitGraph': graphs.gitGraph,
  'eventmodeling': graphs.eventModeling,
  // Hierarchies.
  'mindmap': hierarchies.mindmap,
  'kanban': hierarchies.kanban,
  'treeView': hierarchies.treeView,
  'ishikawa': hierarchies.ishikawa,
  'timeline': hierarchies.timeline,
  'railroad': hierarchies.railroad,
  'railroadEbnf': hierarchies.railroad,
  'railroadAbnf': hierarchies.railroad,
  'railroadPeg': hierarchies.railroad,
  'cynefin': hierarchies.cynefin,
  // Charts.
  'pie': charts.pie,
  'gantt': charts.gantt,
  'packet': charts.packet,
  'quadrantChart': charts.quadrant,
  'xychart': charts.xychart,
  'radar': charts.radar,
  'sankey': charts.sankey,
  'treemap': charts.treemap,
  'journey': charts.journey,
  // Diagrams with traces of their own.
  'sequence': interactions.sequence,
  'venn': interactions.venn,
  'wardley': interactions.wardley,
  // ZenUML's plugin keeps no database; its text is read instead.
  'zenuml': zenuml,
};
