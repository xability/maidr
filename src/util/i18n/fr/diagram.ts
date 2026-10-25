import type { MessageKey } from '../index';

/** French renderings of the diagrams MAIDR names and explains. */
export const diagram = {
  'diagram.flowchart.name': 'Logigramme',
  'diagram.flowchart.definition': 'Un logigramme montre les étapes d\'un processus sous forme de figures reliées par des flèches, dans l\'ordre où elles se produisent.',
  'diagram.flowchart.purpose': 'Il sert à montrer comment un processus se déroule du début à la fin, comme le traitement d\'une commande, avec les décisions qui l\'orientent d\'un côté ou de l\'autre et les étapes auxquelles il revient.',
  'diagram.flowchart.appearance': 'Chaque étape est une boîte ou une autre forme, comme un losange pour une décision. Des flèches mènent d\'étape en étape, généralement de haut en bas ou de gauche à droite, et une flèche peut porter la réponse qui y conduit, comme oui ou non. Les étapes apparentées peuvent être dessinées dans une boîte plus grande appelée sous-graphe.',

  'diagram.swimlane.name': 'Diagramme en couloirs',
  'diagram.swimlane.definition': 'Un diagramme en couloirs est un logigramme dont les étapes sont réparties en couloirs, un pour chaque personne, équipe ou système qui les accomplit.',
  'diagram.swimlane.purpose': 'Il sert à montrer qui fait quoi dans un processus, et où le travail passe de l\'un à l\'autre.',
  'diagram.swimlane.appearance': 'De longues bandes appelées couloirs s\'étendent côte à côte, en largeur ou en hauteur de la page, chacune portant le nom de son responsable. Chaque étape est une boîte dans son couloir, et des flèches mènent d\'étape en étape, passant d\'un couloir à un autre à chaque transmission.',

  'diagram.agent_flow.name': 'Flux d\'agent',
  'diagram.agent_flow.definition': 'Un flux d\'agent montre les étapes qu\'un agent d\'IA suit pour accomplir une tâche, comme les entrées qu\'il lit, les tâches qu\'il effectue, les outils qu\'il appelle et les décisions qu\'il prend, dans l\'ordre où il les suit.',
  'diagram.agent_flow.purpose': 'Il sert à concevoir ou à expliquer comment un agent mène une tâche, comme la revue d\'une modification de code, et où son chemin se divise à une décision.',
  'diagram.agent_flow.appearance': 'Chaque étape est dessinée sous une forme propre à son type, comme un losange pour une décision, dans une boîte représentant le flux auquel elle appartient. Des flèches mènent d\'étape en étape, et une flèche qui sort d\'une décision porte la réponse qui y conduit.',

  'diagram.state.name': 'Diagramme d\'états',
  'diagram.state.definition': 'Un diagramme d\'états montre les états dans lesquels quelque chose peut se trouver, et les événements qui le font passer d\'un état à un autre.',
  'diagram.state.purpose': 'Il sert à décrire le comportement d\'un système, comme un lecteur multimédia qui peut être inactif, en lecture ou en pause, et ce qui le fait changer.',
  'diagram.state.appearance': 'Chaque état est une boîte aux coins arrondis, et les flèches entre les états portent l\'événement qui provoque le changement. Un point plein marque le début et un point dans un anneau la fin, et un état peut contenir des états plus petits dans sa propre boîte.',

  'diagram.class.name': 'Diagramme de classes',
  'diagram.class.definition': 'Un diagramme de classes montre les classes d\'un programme, ce que chacune contient et fait, et les relations entre les classes.',
  'diagram.class.purpose': 'Il sert à concevoir ou à documenter la structure d\'un logiciel, comme les classes qui héritent d\'autres classes et celles qui en regroupent d\'autres.',
  'diagram.class.appearance': 'Chaque classe est une boîte en trois parties : son nom en haut, ses attributs au milieu et ses méthodes en bas. Des traits relient les classes apparentées, et l\'extrémité d\'un trait indique le type de relation, comme un triangle vide du côté de la classe dont on hérite, ou un losange du côté de la classe qui contient l\'autre.',

  'diagram.entity_relationship.name': 'Diagramme entité-association',
  'diagram.entity_relationship.definition': 'Un diagramme entité-association montre les types de choses qu\'enregistre une base de données, appelés entités, et leurs relations.',
  'diagram.entity_relationship.purpose': 'Il sert à concevoir ou à documenter une base de données, comme le nombre de commandes que chaque client peut passer et ce que contient chaque commande.',
  'diagram.entity_relationship.appearance': 'Chaque entité est une boîte surmontée de son nom, souvent avec un tableau de ses attributs en dessous. Des traits relient les entités apparentées, avec un verbe comme « passe », et les marques à chaque extrémité d\'un trait indiquent combien d\'occurrences de cette entité y participent, comme exactement une, ou zéro ou plus.',

  'diagram.requirement.name': 'Diagramme d\'exigences',
  'diagram.requirement.definition': 'Un diagramme d\'exigences montre ce qu\'un système doit faire, sous forme d\'exigences, et les parties du système qui les satisfont ou les vérifient.',
  'diagram.requirement.purpose': 'Il sert en ingénierie des systèmes à relier chaque exigence aux exigences qu\'elle contient, aux éléments qui la satisfont et à la façon dont elle est vérifiée.',
  'diagram.requirement.appearance': 'Chaque exigence ou élément est une boîte surmontée de son type et de son nom, qui énumère des détails comme son identifiant (id), son texte et son risque. Les traits entre les boîtes portent la relation, comme contains ou satisfies.',

  'diagram.use_case.name': 'Diagramme de cas d\'utilisation',
  'diagram.use_case.definition': 'Un diagramme de cas d\'utilisation montre les personnes ou autres systèmes qui utilisent un système, appelés acteurs, et ce qu\'ils peuvent en faire, appelé cas d\'utilisation.',
  'diagram.use_case.purpose': 'Il sert à s\'accorder sur ce qu\'un système doit offrir et à qui, comme ce qu\'un client et un vendeur peuvent chacun faire dans une boutique.',
  'diagram.use_case.appearance': 'Les acteurs sont des bonshommes en bâtons à l\'extérieur d\'une grande boîte qui représente le système. Les cas d\'utilisation sont des ovales dans la boîte, et des traits relient chaque acteur aux cas d\'utilisation auxquels il participe.',

  'diagram.c4.name': 'Diagramme C4',
  'diagram.c4_context.name': 'Diagramme de contexte C4',
  'diagram.c4_container.name': 'Diagramme de conteneurs C4',
  'diagram.c4_component.name': 'Diagramme de composants C4',
  'diagram.c4_dynamic.name': 'Diagramme dynamique C4',
  'diagram.c4_deployment.name': 'Diagramme de déploiement C4',
  'diagram.c4.definition': 'Un diagramme C4 montre un système logiciel à un niveau de détail donné, comme le système parmi les personnes et les systèmes qui l\'entourent, ou les conteneurs ou composants qu\'il contient, et la façon dont ses parties s\'utilisent les unes les autres.',
  'diagram.c4.purpose': 'Il sert à expliquer une architecture logicielle, comme les personnes et les autres systèmes avec lesquels travaille un système bancaire, au niveau de détail dont ses lecteurs ont besoin.',
  'diagram.c4.appearance': 'Chaque personne, système, conteneur ou composant est une boîte portant son nom, son type et une courte description ; une personne a une tête ronde au-dessus de la boîte, et une base de données est un cylindre. Des limites en pointillés regroupent les parties apparentées, et les flèches entre elles indiquent ce que l\'une fait de l\'autre et la technologie utilisée.',

  'diagram.block.name': 'Diagramme en blocs',
  'diagram.block.definition': 'Un diagramme en blocs montre les parties d\'un système sous forme de blocs disposés en lignes et en colonnes, avec des flèches pour leurs liens.',
  'diagram.block.purpose': 'Il sert à donner une vue d\'ensemble simple d\'un système et des endroits où les données ou le contrôle passent d\'une partie à une autre, comme d\'un client vers un serveur et son stockage.',
  'diagram.block.appearance': 'Les blocs sont des boîtes placées dans une grille de colonnes, et un bloc plus grand peut en contenir de plus petits. Des flèches relient les blocs, et un bloc peut lui-même être dessiné comme une flèche qui pointe dans le sens où quelque chose se déplace.',

  'diagram.architecture.name': 'Diagramme d\'architecture',
  'diagram.architecture.definition': 'Un diagramme d\'architecture montre les services qui composent un système, comme les serveurs, les bases de données et le stockage, et les connexions entre eux.',
  'diagram.architecture.purpose': 'Il sert à montrer comment un système est assemblé, souvent dans le cloud, et quels services communiquent avec lesquels.',
  'diagram.architecture.appearance': 'Chaque service est une icône avec son nom en dessous, et les services apparentés sont regroupés dans une boîte en pointillés pour leur groupe. Des traits relient les services connectés, avec une pointe de flèche là où une connexion ne va que dans un sens.',

  'diagram.git_graph.name': 'Graphe Git',
  'diagram.git_graph.definition': 'Un graphe Git montre l\'historique d\'un dépôt de code : ses commits dans l\'ordre, la branche sur laquelle chacun a été fait, et les endroits où les branches se séparent puis sont fusionnées.',
  'diagram.git_graph.purpose': 'Il sert à expliquer un mode de travail avec des branches, comme développer une fonctionnalité sur sa propre branche puis la fusionner dans la branche principale.',
  'diagram.git_graph.appearance': 'Chaque branche est une ligne qui traverse la page, l\'une au-dessus de l\'autre, avec son nom au début. Les commits sont des points le long des lignes dans l\'ordre où ils ont été faits ; une ligne s\'écarte là où une branche commence et revient là où elle est fusionnée, et une étiquette est un libellé au-dessus de son commit.',

  'diagram.event_model.name': 'Modèle d\'événements',
  'diagram.event_model.definition': 'Un modèle d\'événements montre comment l\'information circule dans un système au fil du temps : ce que voit un utilisateur, les commandes qu\'il donne, les événements que ces commandes enregistrent et les vues qu\'on en relit.',
  'diagram.event_model.purpose': 'Il sert à concevoir un système autour des événements qu\'il enregistre, comme un article ajouté à un panier, en suivant chaque étape de l\'écran à la commande et de la commande à l\'événement.',
  'diagram.event_model.appearance': 'Des boîtes sont placées dans des couloirs qui traversent la page : un pour les écrans et les automatisations, un pour les commandes et les modèles de lecture, et un pour chaque flux d\'événements. Le temps va de gauche à droite, et des flèches mènent de chaque boîte à l\'étape suivante.',

  'diagram.mindmap.name': 'Carte mentale',
  'diagram.mindmap.definition': 'Une carte mentale montre des idées qui partent d\'un thème central, chaque branche regroupant des idées liées.',
  'diagram.mindmap.purpose': 'Elle sert à trouver des idées, à prendre des notes ou à organiser un sujet, comme les moyens de rendre un graphique accessible.',
  'diagram.mindmap.appearance': 'Le thème central est au milieu, souvent dans un cercle. Des branches en partent dans toutes les directions, chacune aboutissant à un sous-thème, et des branches plus petites mènent de chaque sous-thème aux idées qui en dépendent.',

  'diagram.kanban.name': 'Tableau kanban',
  'diagram.kanban.definition': 'Un tableau kanban montre le travail sous forme de cartes réparties en colonnes, une colonne par étape du travail.',
  'diagram.kanban.purpose': 'Il sert à suivre l\'avancement des tâches, comme celles qui restent à faire, celles en cours et celles terminées.',
  'diagram.kanban.appearance': 'Les colonnes sont côte à côte, chacune surmontée de son étape, avec des cartes empilées vers le bas. Une carte indique sa tâche et peut indiquer un numéro de ticket, la personne à qui elle est attribuée et une marque de priorité.',

  'diagram.tree_view.name': 'Vue arborescente',
  'diagram.tree_view.definition': 'Une vue arborescente montre une hiérarchie sous forme de liste en retrait, comme les dossiers et les fichiers d\'un projet.',
  'diagram.tree_view.purpose': 'Elle sert à montrer comment les éléments sont imbriqués, comme les fichiers que contient chaque dossier.',
  'diagram.tree_view.appearance': 'L\'élément du haut est sur la première ligne, et les éléments que contient chacun sont listés en dessous, chacun décalé d\'un cran de plus. De courts traits relient chaque élément à celui qui le contient.',

  'diagram.ishikawa.name': 'Diagramme d\'Ishikawa',
  'diagram.ishikawa.definition': 'Un diagramme d\'Ishikawa, aussi appelé diagramme en arêtes de poisson, montre les causes possibles d\'un problème, regroupées par catégories.',
  'diagram.ishikawa.purpose': 'Il sert à rechercher la cause profonde d\'un problème, comme une photo floue, en énumérant toutes les causes probables sous des rubriques comme le matériel ou le procédé.',
  'diagram.ishikawa.appearance': 'Le problème est écrit à la tête d\'un squelette de poisson, à une extrémité d\'une longue arête centrale. Des arêtes obliques partent de l\'arête centrale, chacune aboutissant à une catégorie ; des causes partent de chaque arête, et des causes plus petites partent de celles-ci.',

  'diagram.timeline.name': 'Frise chronologique',
  'diagram.timeline.definition': 'Une frise chronologique montre des événements le long d\'un axe du temps, regroupés selon la période à laquelle ils appartiennent.',
  'diagram.timeline.purpose': 'Elle sert à raconter d\'un coup d\'œil l\'histoire de quelque chose, comme les grandes étapes des normes d\'accessibilité du web.',
  'diagram.timeline.appearance': 'Les périodes, comme les années, sont des boîtes alignées de gauche à droite au-dessus d\'une ligne fléchée qui figure le temps, et peuvent être regroupées sous des titres de section placés au-dessus. Les événements de chaque période sont des boîtes empilées en dessous.',

  'diagram.railroad.name': 'Diagramme syntaxique',
  'diagram.railroad.definition': 'Un diagramme syntaxique, aussi appelé diagramme en chemin de fer, montre les règles d\'une grammaire comme des voies à suivre du début à la fin.',
  'diagram.railroad.purpose': 'Il sert à documenter ce qu\'un langage accepte, comme la manière d\'écrire un nombre signé.',
  'diagram.railroad.appearance': 'Chaque règle est une voie qui va d\'un point à gauche à un point à droite, en passant par des boîtes pour les mots, les symboles et les autres règles qui la composent. Là où la voie se divise, on peut prendre n\'importe quelle branche ; une boucle en arrière signifie qu\'une partie peut se répéter, et un chemin qui contourne une partie signifie qu\'on peut l\'omettre.',

  'diagram.cynefin.name': 'Cadre Cynefin',
  'diagram.cynefin.definition': 'Le cadre Cynefin classe les situations en cinq domaines selon la clarté avec laquelle on voit la cause et l\'effet : clair (clear), compliqué (complicated), complexe (complex) et chaotique (chaotic), plus la confusion (confusion) tant qu\'on ne sait pas encore lequel s\'applique.',
  'diagram.cynefin.purpose': 'Il sert à décider comment réagir à une situation, comme un incident, en la plaçant dans un domaine et en adoptant l\'approche que ce domaine demande.',
  'diagram.cynefin.appearance': 'Quatre domaines occupent les quarts d\'un carré : complexe en haut à gauche, compliqué en haut à droite, chaotique en bas à gauche et clair en bas à droite, avec la confusion dans un ovale au centre. Chaque domaine indique son approche sous son titre, les éléments qui y sont placés sont des boîtes, et des flèches entre les domaines marquent les transitions.',

  'diagram.quadrant.name': 'Graphique à quadrants',
  'diagram.quadrant.definition': 'Un graphique à quadrants place des éléments sur deux échelles et divise la surface en quatre quarts, chacun avec sa propre signification.',
  'diagram.quadrant.purpose': 'Il sert à trier ou à hiérarchiser des éléments, comme des campagnes selon leur portée et leur engagement, d\'après le quart où tombe chacun.',
  'diagram.quadrant.appearance': 'Un carré est divisé en quatre quadrants, chacun portant sa signification ; une échelle va de gauche à droite et l\'autre de bas en haut. Chaque élément est un point placé selon ses deux valeurs et étiqueté de son nom.',

  'diagram.user_journey.name': 'Parcours utilisateur',
  'diagram.user_journey.definition': 'Un parcours utilisateur montre les tâches par lesquelles passe une personne pour atteindre un but, et sa satisfaction à chacune.',
  'diagram.user_journey.purpose': 'Il sert à repérer les bons et les mauvais moments d\'une expérience, comme une journée de travail, afin d\'améliorer les mauvais.',
  'diagram.user_journey.appearance': 'Les tâches sont des boîtes alignées de gauche à droite, regroupées sous des titres de section, avec un petit point sur chaque tâche pour chaque personne qui y participe. En dessous, un visage par tâche est dessiné plus haut et souriant pour une bonne note, plus bas et renfrogné pour une mauvaise.',

  'diagram.packet.name': 'Diagramme de paquet',
  'diagram.packet.definition': 'Un diagramme de paquet montre la structure d\'un paquet réseau ou d\'un autre bloc de données, sous forme de champs de bits dans l\'ordre.',
  'diagram.packet.purpose': 'Il sert à documenter un format de données ou un protocole, comme les bits d\'un en-tête UDP qui contiennent les ports, la longueur et la somme de contrôle.',
  'diagram.packet.appearance': 'Les bits sont numérotés de gauche à droite en lignes de longueur fixe, généralement 32. Chaque champ est une boîte aussi large que les bits qu\'il occupe, portant son nom, avec son premier et son dernier bit numérotés au-dessus.',

  'diagram.wardley_map.name': 'Carte de Wardley',
  'diagram.wardley_map.definition': 'Une carte de Wardley place les composants qui répondent au besoin d\'un utilisateur sur deux échelles : leur visibilité pour l\'utilisateur et leur degré d\'évolution, du nouveau et incertain au standard et fiable.',
  'diagram.wardley_map.purpose': 'Elle sert à élaborer une stratégie, comme décider quoi construire et quoi acheter, en voyant comment les composants dépendent les uns des autres et comment ils vont changer.',
  'diagram.wardley_map.appearance': 'La visibilité va de bas en haut et l\'évolution de gauche à droite, à travers les étapes genèse (genesis), sur mesure (custom built), produit (product) et commodité (commodity). Chaque composant est un point portant son nom, des traits relient chaque composant à ceux dont il dépend, et une flèche indique où se dirige un composant en évolution.',
} satisfies Partial<Record<MessageKey, string>>;
