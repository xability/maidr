/**
 * What each Mermaid diagram is called, and what it is, for the diagrams read
 * as a MAIDR layer type they are not.
 *
 * A diagram is read as the layer type that navigates it: a class diagram as
 * a `directed_graph`, a kanban board as a `tree`, a user journey as a `line`.
 * Named after that type, it was described as that type too: the description
 * said a class diagram was a directed graph "used to show how something is
 * computed, such as the layers of a neural network", and a kanban board a
 * tree diagram whose "lines branch out" from "one item at the top or left".
 * Neither is what Mermaid draws. Each such layer names its diagram instead
 * (`typeLabel`), with a guide to it (`typeGuide`), as the page and a sighted
 * reader name it.
 *
 * A diagram that is the chart its layer type names -- a pie, a gantt, an XY
 * chart's bars and line, a radar, a sankey, a treemap, a sequence or Venn
 * diagram -- keeps that type's name and its translated guide.
 */

import type { TypeGuide } from '@type/grammar';

/** What a layer calls its diagram, and its guide to it. */
export interface DiagramType {
  /** The diagram's name, as the page names it. */
  typeLabel: string;
  /** What the diagram is, what it is used for, and what it looks like. */
  typeGuide: TypeGuide;
}

/**
 * Every diagram read as a layer type it is not, by the converter that reads
 * it. Each guide says what Mermaid draws, by shape and position rather than
 * by colour alone.
 */
export const DIAGRAM_TYPES = {
  flowchart: {
    typeLabel: 'Flowchart',
    typeGuide: {
      definition: 'A flowchart shows the steps of a process as shapes joined by arrows, in the order they happen.',
      purpose: 'It is used to show how a process runs from start to finish, such as handling an order, with the decisions that send it one way or another and the steps it goes back to.',
      appearance: 'Each step is a box or another shape, such as a diamond for a decision. Arrows lead from step to step, usually from top to bottom or from left to right, and an arrow may be labelled with the answer that takes it, such as yes or no. Related steps can be drawn inside a larger box called a subgraph.',
    },
  },
  swimlane: {
    typeLabel: 'Swimlane Diagram',
    typeGuide: {
      definition: 'A swimlane diagram is a flowchart whose steps are divided into lanes, one for each person, team or system that carries them out.',
      purpose: 'It is used to show who does what in a process, and where the work is handed from one of them to another.',
      appearance: 'Long bands called lanes lie side by side, across or down the page, each labelled with whose it is. Each step is a box in its lane, and arrows lead from step to step, crossing from one lane into another at each hand-off.',
    },
  },
  agentflow: {
    typeLabel: 'Agent Flow',
    typeGuide: {
      definition: 'An agent flow shows the steps an AI agent takes to do a task, such as the inputs it reads, the tasks it carries out, the tools it calls and the decisions it makes, in the order it takes them.',
      purpose: 'It is used to design or explain how an agent works through a task, such as reviewing a code change, and where its path splits on a decision.',
      appearance: 'Each step is drawn in a shape for its kind, such as a diamond for a decision, inside a box for the flow it belongs to. Arrows lead from step to step, and an arrow out of a decision is labelled with the answer that takes it.',
    },
  },
  state: {
    typeLabel: 'State Diagram',
    typeGuide: {
      definition: 'A state diagram shows the states something can be in, and the events that move it from one state to another.',
      purpose: 'It is used to describe how a system behaves, such as a media player that can be idle, playing or paused, and what makes it change.',
      appearance: 'Each state is a rounded box, and arrows between states are labelled with the event that causes the change. A filled dot marks where it starts and a dot inside a ring where it ends, and a state can hold smaller states inside its own box.',
    },
  },
  class: {
    typeLabel: 'Class Diagram',
    typeGuide: {
      definition: 'A class diagram shows the classes of a program, what each one holds and does, and how the classes are related.',
      purpose: 'It is used to design or document the structure of software, such as which classes inherit from others and which are made up of others.',
      appearance: 'Each class is a box in three parts: its name at the top, its attributes in the middle and its methods at the bottom. Lines join related classes, and the end of a line shows the kind of relation, such as a hollow triangle at the class inherited from, or a diamond at the class that holds the other.',
    },
  },
  entityRelationship: {
    typeLabel: 'Entity Relationship Diagram',
    typeGuide: {
      definition: 'An entity relationship diagram shows the kinds of thing a database records, called entities, and how they are related.',
      purpose: 'It is used to design or document a database, such as how many orders each customer can place and what each order contains.',
      appearance: 'Each entity is a box headed by its name, often with a table of its attributes below. Lines join related entities, labelled with a verb such as places, and the marks at each end of a line show how many of that entity take part, such as exactly one, or zero or more.',
    },
  },
  requirement: {
    typeLabel: 'Requirement Diagram',
    typeGuide: {
      definition: 'A requirement diagram shows what a system must do, as requirements, and the parts of the system that meet or test them.',
      purpose: 'It is used in systems engineering to trace each requirement to the requirements it contains, the elements that satisfy it, and how it is verified.',
      appearance: 'Each requirement or element is a box headed by its kind and name, listing details such as its id, text and risk. Lines between the boxes are labelled with the relationship, such as contains or satisfies.',
    },
  },
  usecase: {
    typeLabel: 'Use Case Diagram',
    typeGuide: {
      definition: 'A use case diagram shows the people or other systems that use a system, called actors, and what they can do with it, called use cases.',
      purpose: 'It is used to agree what a system should offer and to whom, such as what a customer and a clerk can each do in a shop.',
      appearance: 'Actors are stick figures outside a large box that stands for the system. Use cases are ovals inside the box, and lines join each actor to the use cases it takes part in.',
    },
  },
  c4: {
    typeLabel: 'C4 Diagram',
    typeGuide: {
      definition: 'A C4 diagram shows a software system at one level of detail, such as the system among the people and systems around it, or the containers or components inside it, and how its parts use one another.',
      purpose: 'It is used to explain a software architecture, such as which people and other systems a banking system works with, at the level of detail its readers need.',
      appearance: 'Each person, system, container or component is a box labelled with its name, its kind and a short description; a person has a round head above the box, and a database is a cylinder. Dashed boundaries group related parts, and arrows between them are labelled with what one does with the other and the technology it uses.',
    },
  },
  block: {
    typeLabel: 'Block Diagram',
    typeGuide: {
      definition: 'A block diagram shows the parts of a system as blocks laid out in rows and columns, with arrows for how they connect.',
      purpose: 'It is used to give a simple overview of a system and of where data or control passes from one part to another, such as from a client to a server and its storage.',
      appearance: 'Blocks are boxes placed in a grid of columns, and a larger block can hold smaller ones. Arrows join the blocks, and a block can itself be drawn as an arrow pointing the way something moves.',
    },
  },
  architecture: {
    typeLabel: 'Architecture Diagram',
    typeGuide: {
      definition: 'An architecture diagram shows the services a system is made of, such as servers, databases and storage, and the connections between them.',
      purpose: 'It is used to show how a system is put together, often in the cloud, and which of its services talk to which.',
      appearance: 'Each service is an icon with its name below it, and related services sit together inside a dashed box for their group. Lines join connected services, with an arrowhead where a connection runs one way.',
    },
  },
  gitGraph: {
    typeLabel: 'Git Graph',
    typeGuide: {
      definition: 'A git graph shows the history of a code repository: its commits in order, the branch each was made on, and where branches split off and are merged back.',
      purpose: 'It is used to explain a branching workflow, such as building a feature on a branch of its own and merging it into the main one.',
      appearance: 'Each branch is a line across the page, one above another, with its name at the start. Commits are dots along the lines in the order they were made, a line curves away where a branch starts and back where it is merged, and a tag is a label above its commit.',
    },
  },
  eventModel: {
    typeLabel: 'Event Model',
    typeGuide: {
      definition: 'An event model shows how information moves through a system over time: what a user sees, the commands they give, the events those commands record, and the views read back from them.',
      purpose: 'It is used to design a system around the events it records, such as an item added to a shopping cart, following each step from screen to command to event.',
      appearance: 'Boxes sit in lanes running across the page: one for screens and automations, one for commands and read models, and one for each stream of events. Time runs from left to right, and arrows lead from each box to the next step.',
    },
  },
  mindmap: {
    typeLabel: 'Mindmap',
    typeGuide: {
      definition: 'A mindmap shows ideas branching out from one central topic, each branch holding related ideas.',
      purpose: 'It is used to brainstorm, take notes or organise a subject, such as the ways a chart can be made accessible.',
      appearance: 'The central topic sits in the middle, often in a circle. Branches spread out from it in all directions, each ending in a subtopic, and smaller branches lead from each subtopic to the ideas under it.',
    },
  },
  kanban: {
    typeLabel: 'Kanban Board',
    typeGuide: {
      definition: 'A kanban board shows work as cards sorted into columns, one column for each stage of the work.',
      purpose: 'It is used to track the progress of tasks, such as which are still to do, which are in progress and which are done.',
      appearance: 'Columns stand side by side, each headed by its stage, with cards stacked down each one. A card shows its task, and may show a ticket number, the person it is assigned to and a mark for its priority.',
    },
  },
  treeView: {
    typeLabel: 'Tree View',
    typeGuide: {
      definition: 'A tree view shows a hierarchy as an indented list, such as the folders and files of a project.',
      purpose: 'It is used to show how items are nested, such as which files sit in which folders.',
      appearance: 'The top item is on the first line, and the items inside each one are listed below it, each indented one step further. Short lines join each item to the one it sits in.',
    },
  },
  ishikawa: {
    typeLabel: 'Ishikawa Diagram',
    typeGuide: {
      definition: 'An Ishikawa diagram, also called a fishbone diagram, shows the possible causes of a problem, grouped into categories.',
      purpose: 'It is used to look for the root cause of a problem, such as a blurry photo, by listing every likely cause under headings such as equipment or process.',
      appearance: 'The problem is written at the head of a fish skeleton, at one end of a long spine. Bones slant off the spine, each ending in a category, and causes branch off each bone, with smaller causes branching off those.',
    },
  },
  timeline: {
    typeLabel: 'Timeline',
    typeGuide: {
      definition: 'A timeline shows events along a line of time, grouped by the period they belong to.',
      purpose: 'It is used to tell the history of something at a glance, such as the milestones of web accessibility standards.',
      appearance: 'Periods, such as years, are boxes in a row from left to right above a line with an arrow for time, and may be grouped under section headings above them. The events of each period are boxes stacked below it.',
    },
  },
  railroad: {
    typeLabel: 'Railroad Diagram',
    typeGuide: {
      definition: 'A railroad diagram, also called a syntax diagram, shows the rules of a grammar as tracks to follow from start to end.',
      purpose: 'It is used to document what a language accepts, such as how a signed number may be written.',
      appearance: 'Each rule is a track from a dot on the left to a dot on the right, passing boxes for the words, symbols and other rules it is made of. Where the track splits, any one branch may be taken; a loop back means a part can repeat, and a path around a part means it can be left out.',
    },
  },
  cynefin: {
    typeLabel: 'Cynefin Framework',
    typeGuide: {
      definition: 'The Cynefin framework sorts situations into five domains by how clearly cause and effect can be seen: clear, complicated, complex and chaotic, and confusion while it is not yet known which of them applies.',
      purpose: 'It is used to decide how to respond to a situation, such as an incident, by placing it in a domain and taking the approach that domain calls for.',
      appearance: 'Four domains fill the quarters of a square: complex at top left, complicated at top right, chaotic at bottom left and clear at bottom right, with confusion in an oval in the middle. Each domain names its approach under its title, the items placed in it are boxes, and arrows between domains mark transitions.',
    },
  },
  quadrant: {
    typeLabel: 'Quadrant Chart',
    typeGuide: {
      definition: 'A quadrant chart places items on two scales and splits the area into four quarters, each with its own meaning.',
      purpose: 'It is used to sort or prioritise items, such as campaigns by their reach and engagement, by the quarter each one falls in.',
      appearance: 'A square is divided into four quadrants, each labelled with its meaning, with one scale running from left to right and the other from bottom to top. Each item is a dot placed by its two values and labelled with its name.',
    },
  },
  journey: {
    typeLabel: 'User Journey',
    typeGuide: {
      definition: 'A user journey shows the tasks a person goes through to reach a goal, and how satisfied they are at each one.',
      purpose: 'It is used to find the good and bad moments of an experience, such as a working day, so that the bad ones can be improved.',
      appearance: 'Tasks are boxes in a row from left to right, grouped under section headings, with a small dot on each task for everyone who takes part. Below them is a face for each task, drawn higher and smiling for a good score and lower and frowning for a bad one.',
    },
  },
  packet: {
    typeLabel: 'Packet Diagram',
    typeGuide: {
      definition: 'A packet diagram shows the layout of a network packet or another block of data, as fields of bits in order.',
      purpose: 'It is used to document a data format or protocol, such as which bits of a UDP header hold the ports, the length and the checksum.',
      appearance: 'Bits are numbered from left to right in rows of a fixed length, usually 32. Each field is a box as wide as the bits it takes, labelled with its name, with its first and last bit numbered above it.',
    },
  },
  wardley: {
    typeLabel: 'Wardley Map',
    typeGuide: {
      definition: 'A Wardley map places the components that meet a user\'s need on two scales: how visible each one is to the user, and how evolved it is, from new and uncertain to standard and dependable.',
      purpose: 'It is used to plan strategy, such as what to build and what to buy, by seeing how the components depend on one another and how they will change.',
      appearance: 'Visibility runs from bottom to top and evolution from left to right, through stages named genesis, custom built, product and commodity. Each component is a dot with its name, lines join each component to those it depends on, and an arrow points to where an evolving component is heading.',
    },
  },
} satisfies Record<string, DiagramType>;

/** The name of each level of C4 diagram, by the keyword Mermaid parsed. */
const C4_LEVELS = new Map([
  ['C4Context', 'C4 Context Diagram'],
  ['C4Container', 'C4 Container Diagram'],
  ['C4Component', 'C4 Component Diagram'],
  ['C4Dynamic', 'C4 Dynamic Diagram'],
  ['C4Deployment', 'C4 Deployment Diagram'],
]);

/**
 * A C4 diagram, named for its level: a `C4Context` diagram is a C4 Context
 * Diagram, as the C4 model and Mermaid's documentation name it.
 *
 * @param level - The keyword the diagram was written with, as Mermaid keeps it
 * @returns The diagram's type, a plain C4 Diagram for a level it does not know
 */
export function c4DiagramType(level: string | undefined): DiagramType {
  return { ...DIAGRAM_TYPES.c4, typeLabel: C4_LEVELS.get(level ?? '') ?? DIAGRAM_TYPES.c4.typeLabel };
}
