/**
 * The diagrams MAIDR names and explains though no layer type of its own reads
 * them: a layer read as a type it is not says which it is in `diagramType`,
 * and MAIDR names it here, in place of the type's name, and explains it in
 * the description's "About this chart type" guide.
 *
 * Keys are `diagram.<diagram type>.<part>`, built from the `DiagramType`
 * value, so a type added without a name fails the type check in
 * `diagramTypeLabel`, and one without a guide in `diagramTypeGuide`. The
 * levels of a C4 diagram share the C4 diagram's guide. Each guide says what
 * the diagram looks like by shape and position rather than by colour alone.
 */
export const diagram = {
  'diagram.flowchart.name': 'Flowchart',
  'diagram.flowchart.definition': 'A flowchart shows the steps of a process as shapes joined by arrows, in the order they happen.',
  'diagram.flowchart.purpose': 'It is used to show how a process runs from start to finish, such as handling an order, with the decisions that send it one way or another and the steps it goes back to.',
  'diagram.flowchart.appearance': 'Each step is a box or another shape, such as a diamond for a decision. Arrows lead from step to step, usually from top to bottom or from left to right, and an arrow may be labelled with the answer that takes it, such as yes or no. Related steps can be drawn inside a larger box called a subgraph.',

  'diagram.swimlane.name': 'Swimlane Diagram',
  'diagram.swimlane.definition': 'A swimlane diagram is a flowchart whose steps are divided into lanes, one for each person, team or system that carries them out.',
  'diagram.swimlane.purpose': 'It is used to show who does what in a process, and where the work is handed from one of them to another.',
  'diagram.swimlane.appearance': 'Long bands called lanes lie side by side, across or down the page, each labelled with whose it is. Each step is a box in its lane, and arrows lead from step to step, crossing from one lane into another at each hand-off.',

  'diagram.agent_flow.name': 'Agent Flow',
  'diagram.agent_flow.definition': 'An agent flow shows the steps an AI agent takes to do a task, such as the inputs it reads, the tasks it carries out, the tools it calls and the decisions it makes, in the order it takes them.',
  'diagram.agent_flow.purpose': 'It is used to design or explain how an agent works through a task, such as reviewing a code change, and where its path splits on a decision.',
  'diagram.agent_flow.appearance': 'Each step is drawn in a shape for its kind, such as a diamond for a decision, inside a box for the flow it belongs to. Arrows lead from step to step, and an arrow out of a decision is labelled with the answer that takes it.',

  'diagram.state.name': 'State Diagram',
  'diagram.state.definition': 'A state diagram shows the states something can be in, and the events that move it from one state to another.',
  'diagram.state.purpose': 'It is used to describe how a system behaves, such as a media player that can be idle, playing or paused, and what makes it change.',
  'diagram.state.appearance': 'Each state is a rounded box, and arrows between states are labelled with the event that causes the change. A filled dot marks where it starts and a dot inside a ring where it ends, and a state can hold smaller states inside its own box.',

  'diagram.class.name': 'Class Diagram',
  'diagram.class.definition': 'A class diagram shows the classes of a program, what each one holds and does, and how the classes are related.',
  'diagram.class.purpose': 'It is used to design or document the structure of software, such as which classes inherit from others and which are made up of others.',
  'diagram.class.appearance': 'Each class is a box in three parts: its name at the top, its attributes in the middle and its methods at the bottom. Lines join related classes, and the end of a line shows the kind of relation, such as a hollow triangle at the class inherited from, or a diamond at the class that holds the other.',

  'diagram.entity_relationship.name': 'Entity Relationship Diagram',
  'diagram.entity_relationship.definition': 'An entity relationship diagram shows the kinds of thing a database records, called entities, and how they are related.',
  'diagram.entity_relationship.purpose': 'It is used to design or document a database, such as how many orders each customer can place and what each order contains.',
  'diagram.entity_relationship.appearance': 'Each entity is a box headed by its name, often with a table of its attributes below. Lines join related entities, labelled with a verb such as places, and the marks at each end of a line show how many of that entity take part, such as exactly one, or zero or more.',

  'diagram.requirement.name': 'Requirement Diagram',
  'diagram.requirement.definition': 'A requirement diagram shows what a system must do, as requirements, and the parts of the system that meet or test them.',
  'diagram.requirement.purpose': 'It is used in systems engineering to trace each requirement to the requirements it contains, the elements that satisfy it, and how it is verified.',
  'diagram.requirement.appearance': 'Each requirement or element is a box headed by its kind and name, listing details such as its id, text and risk. Lines between the boxes are labelled with the relationship, such as contains or satisfies.',

  'diagram.use_case.name': 'Use Case Diagram',
  'diagram.use_case.definition': 'A use case diagram shows the people or other systems that use a system, called actors, and what they can do with it, called use cases.',
  'diagram.use_case.purpose': 'It is used to agree what a system should offer and to whom, such as what a customer and a clerk can each do in a shop.',
  'diagram.use_case.appearance': 'Actors are stick figures outside a large box that stands for the system. Use cases are ovals inside the box, and lines join each actor to the use cases it takes part in.',

  'diagram.c4.name': 'C4 Diagram',
  'diagram.c4_context.name': 'C4 Context Diagram',
  'diagram.c4_container.name': 'C4 Container Diagram',
  'diagram.c4_component.name': 'C4 Component Diagram',
  'diagram.c4_dynamic.name': 'C4 Dynamic Diagram',
  'diagram.c4_deployment.name': 'C4 Deployment Diagram',
  'diagram.c4.definition': 'A C4 diagram shows a software system at one level of detail, such as the system among the people and systems around it, or the containers or components inside it, and how its parts use one another.',
  'diagram.c4.purpose': 'It is used to explain a software architecture, such as which people and other systems a banking system works with, at the level of detail its readers need.',
  'diagram.c4.appearance': 'Each person, system, container or component is a box labelled with its name, its kind and a short description; a person has a round head above the box, and a database is a cylinder. Dashed boundaries group related parts, and arrows between them are labelled with what one does with the other and the technology it uses.',

  'diagram.block.name': 'Block Diagram',
  'diagram.block.definition': 'A block diagram shows the parts of a system as blocks laid out in rows and columns, with arrows for how they connect.',
  'diagram.block.purpose': 'It is used to give a simple overview of a system and of where data or control passes from one part to another, such as from a client to a server and its storage.',
  'diagram.block.appearance': 'Blocks are boxes placed in a grid of columns, and a larger block can hold smaller ones. Arrows join the blocks, and a block can itself be drawn as an arrow pointing the way something moves.',

  'diagram.architecture.name': 'Architecture Diagram',
  'diagram.architecture.definition': 'An architecture diagram shows the services a system is made of, such as servers, databases and storage, and the connections between them.',
  'diagram.architecture.purpose': 'It is used to show how a system is put together, often in the cloud, and which of its services talk to which.',
  'diagram.architecture.appearance': 'Each service is an icon with its name below it, and related services sit together inside a dashed box for their group. Lines join connected services, with an arrowhead where a connection runs one way.',

  'diagram.git_graph.name': 'Git Graph',
  'diagram.git_graph.definition': 'A git graph shows the history of a code repository: its commits in order, the branch each was made on, and where branches split off and are merged back.',
  'diagram.git_graph.purpose': 'It is used to explain a branching workflow, such as building a feature on a branch of its own and merging it into the main one.',
  'diagram.git_graph.appearance': 'Each branch is a line across the page, one above another, with its name at the start. Commits are dots along the lines in the order they were made, a line curves away where a branch starts and back where it is merged, and a tag is a label above its commit.',

  'diagram.event_model.name': 'Event Model',
  'diagram.event_model.definition': 'An event model shows how information moves through a system over time: what a user sees, the commands they give, the events those commands record, and the views read back from them.',
  'diagram.event_model.purpose': 'It is used to design a system around the events it records, such as an item added to a shopping cart, following each step from screen to command to event.',
  'diagram.event_model.appearance': 'Boxes sit in lanes running across the page: one for screens and automations, one for commands and read models, and one for each stream of events. Time runs from left to right, and arrows lead from each box to the next step.',

  'diagram.mindmap.name': 'Mindmap',
  'diagram.mindmap.definition': 'A mindmap shows ideas branching out from one central topic, each branch holding related ideas.',
  'diagram.mindmap.purpose': 'It is used to brainstorm, take notes or organise a subject, such as the ways a chart can be made accessible.',
  'diagram.mindmap.appearance': 'The central topic sits in the middle, often in a circle. Branches spread out from it in all directions, each ending in a subtopic, and smaller branches lead from each subtopic to the ideas under it.',

  'diagram.kanban.name': 'Kanban Board',
  'diagram.kanban.definition': 'A kanban board shows work as cards sorted into columns, one column for each stage of the work.',
  'diagram.kanban.purpose': 'It is used to track the progress of tasks, such as which are still to do, which are in progress and which are done.',
  'diagram.kanban.appearance': 'Columns stand side by side, each headed by its stage, with cards stacked down each one. A card shows its task, and may show a ticket number, the person it is assigned to and a mark for its priority.',

  'diagram.tree_view.name': 'Tree View',
  'diagram.tree_view.definition': 'A tree view shows a hierarchy as an indented list, such as the folders and files of a project.',
  'diagram.tree_view.purpose': 'It is used to show how items are nested, such as which files sit in which folders.',
  'diagram.tree_view.appearance': 'The top item is on the first line, and the items inside each one are listed below it, each indented one step further. Short lines join each item to the one it sits in.',

  'diagram.ishikawa.name': 'Ishikawa Diagram',
  'diagram.ishikawa.definition': 'An Ishikawa diagram, also called a fishbone diagram, shows the possible causes of a problem, grouped into categories.',
  'diagram.ishikawa.purpose': 'It is used to look for the root cause of a problem, such as a blurry photo, by listing every likely cause under headings such as equipment or process.',
  'diagram.ishikawa.appearance': 'The problem is written at the head of a fish skeleton, at one end of a long spine. Bones slant off the spine, each ending in a category, and causes branch off each bone, with smaller causes branching off those.',

  'diagram.timeline.name': 'Timeline',
  'diagram.timeline.definition': 'A timeline shows events along a line of time, grouped by the period they belong to.',
  'diagram.timeline.purpose': 'It is used to tell the history of something at a glance, such as the milestones of web accessibility standards.',
  'diagram.timeline.appearance': 'Periods, such as years, are boxes in a row from left to right above a line with an arrow for time, and may be grouped under section headings above them. The events of each period are boxes stacked below it.',

  'diagram.railroad.name': 'Railroad Diagram',
  'diagram.railroad.definition': 'A railroad diagram, also called a syntax diagram, shows the rules of a grammar as tracks to follow from start to end.',
  'diagram.railroad.purpose': 'It is used to document what a language accepts, such as how a signed number may be written.',
  'diagram.railroad.appearance': 'Each rule is a track from a dot on the left to a dot on the right, passing boxes for the words, symbols and other rules it is made of. Where the track splits, any one branch may be taken; a loop back means a part can repeat, and a path around a part means it can be left out.',

  'diagram.cynefin.name': 'Cynefin Framework',
  'diagram.cynefin.definition': 'The Cynefin framework sorts situations into five domains by how clearly cause and effect can be seen: clear, complicated, complex and chaotic, and confusion while it is not yet known which of them applies.',
  'diagram.cynefin.purpose': 'It is used to decide how to respond to a situation, such as an incident, by placing it in a domain and taking the approach that domain calls for.',
  'diagram.cynefin.appearance': 'Four domains fill the quarters of a square: complex at top left, complicated at top right, chaotic at bottom left and clear at bottom right, with confusion in an oval in the middle. Each domain names its approach under its title, the items placed in it are boxes, and arrows between domains mark transitions.',

  'diagram.quadrant.name': 'Quadrant Chart',
  'diagram.quadrant.definition': 'A quadrant chart places items on two scales and splits the area into four quarters, each with its own meaning.',
  'diagram.quadrant.purpose': 'It is used to sort or prioritise items, such as campaigns by their reach and engagement, by the quarter each one falls in.',
  'diagram.quadrant.appearance': 'A square is divided into four quadrants, each labelled with its meaning, with one scale running from left to right and the other from bottom to top. Each item is a dot placed by its two values and labelled with its name.',

  'diagram.user_journey.name': 'User Journey',
  'diagram.user_journey.definition': 'A user journey shows the tasks a person goes through to reach a goal, and how satisfied they are at each one.',
  'diagram.user_journey.purpose': 'It is used to find the good and bad moments of an experience, such as a working day, so that the bad ones can be improved.',
  'diagram.user_journey.appearance': 'Tasks are boxes in a row from left to right, grouped under section headings, with a small dot on each task for everyone who takes part. Below them is a face for each task, drawn higher and smiling for a good score and lower and frowning for a bad one.',

  'diagram.packet.name': 'Packet Diagram',
  'diagram.packet.definition': 'A packet diagram shows the layout of a network packet or another block of data, as fields of bits in order.',
  'diagram.packet.purpose': 'It is used to document a data format or protocol, such as which bits of a UDP header hold the ports, the length and the checksum.',
  'diagram.packet.appearance': 'Bits are numbered from left to right in rows of a fixed length, usually 32. Each field is a box as wide as the bits it takes, labelled with its name, with its first and last bit numbered above it.',

  'diagram.wardley_map.name': 'Wardley Map',
  'diagram.wardley_map.definition': 'A Wardley map places the components that meet a user\'s need on two scales: how visible each one is to the user, and how evolved it is, from new and uncertain to standard and dependable.',
  'diagram.wardley_map.purpose': 'It is used to plan strategy, such as what to build and what to buy, by seeing how the components depend on one another and how they will change.',
  'diagram.wardley_map.appearance': 'Visibility runs from bottom to top and evolution from left to right, through stages named genesis, custom built, product and commodity. Each component is a dot with its name, lines join each component to those it depends on, and an arrow points to where an evolving component is heading.',
} as const;
