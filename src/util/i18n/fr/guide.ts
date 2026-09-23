import type { MessageKey } from '../index';

export const guide = {
  // Dialog chrome.
  'guide.toggle': 'À propos de ce type de graphique ({chartType})',
  'guide.definitionHeading': 'De quoi s\'agit-il',
  'guide.purposeHeading': 'À quoi ça sert',
  'guide.appearanceHeading': 'À quoi ça ressemble',

  // Multi-panel figure.
  'guide.figure.definition': 'Une figure à plusieurs panneaux réunit plusieurs petits graphiques, côte à côte ou en grille, sous un même titre général.',
  'guide.figure.purpose': 'Elle sert à comparer d\'un coup d\'œil plusieurs vues liées des mêmes données. Par exemple, la même mesure pour différents groupes ou différentes années.',
  'guide.figure.appearance': 'Imaginez une page découpée en cases, comme une fenêtre à plusieurs carreaux. Chaque case contient son propre graphique, avec ses propres axes. Vous entrez dans un panneau à la fois.',

  'guide.area.definition': 'Un graphique en aires est un graphique linéaire dont l\'espace entre la ligne et l\'axe du bas est rempli.',
  'guide.area.purpose': 'Il sert à montrer comment une quantité monte et descend au fil du temps. Le remplissage aide à percevoir la taille totale de cette quantité.',
  'guide.area.appearance': 'Une ligne va de gauche à droite et monte ou descend avec les valeurs. Tout l\'espace sous la ligne, jusqu\'à la base, est rempli. On dirait une chaîne de montagnes vue de profil.',

  'guide.alluvial.definition': 'Un diagramme alluvial montre comment des éléments passent d\'un groupe à un autre au fil de plusieurs étapes.',
  'guide.alluvial.purpose': 'Il sert à suivre les changements d\'appartenance à un groupe. Par exemple, comment les électeurs ont changé de parti d\'une élection à la suivante.',
  'guide.alluvial.appearance': 'Des colonnes de blocs empilés se suivent de gauche à droite, une colonne par étape. Des bandes courbes coulent d\'une colonne à la suivante. Plus une bande est épaisse, plus il y a d\'éléments qui ont pris ce chemin.',

  'guide.bar.definition': 'Un diagramme à barres représente un nombre par catégorie, sous forme de barre.',
  'guide.bar.purpose': 'Il sert à comparer des quantités entre catégories. Par exemple, les ventes par mois ou les voix par candidat.',
  'guide.bar.appearance': 'Des rectangles de même largeur sont alignés côte à côte, à partir d\'une même base. Plus la barre est longue, plus la valeur est grande. Les barres peuvent être debout ou couchées.',

  'guide.bump.definition': 'Un graphique de classement montre comment le rang de plusieurs concurrents évolue dans le temps.',
  'guide.bump.purpose': 'Il sert à suivre qui est premier, deuxième, troisième, et ainsi de suite, et à repérer quand l\'un dépasse l\'autre. Par exemple, des équipes dans un championnat.',
  'guide.bump.appearance': 'Le temps va de gauche à droite et le rang va de haut en bas, avec la première place en haut. Chaque concurrent est une ligne avec un point à chaque étape. Les lignes se croisent quand deux concurrents échangent leur place.',

  'guide.box.definition': 'Une boîte à moustaches résume une série de nombres avec cinq valeurs : la plus basse, le premier quart, le milieu, le troisième quart et la plus haute.',
  'guide.box.purpose': 'Elle sert à comparer la dispersion et le centre de plusieurs groupes. Elle aide aussi à repérer les valeurs inhabituelles, appelées valeurs aberrantes.',
  'guide.box.appearance': 'Chaque groupe a une boîte, traversée par un trait à la valeur du milieu. Des traits fins, appelés moustaches, partent des deux bouts de la boîte jusqu\'aux valeurs habituelles la plus basse et la plus haute. Les valeurs aberrantes sont de petits points au-delà des moustaches.',

  'guide.boxen.definition': 'Un diagramme à valeurs-lettres est une boîte à moustaches enrichie. Il montre davantage de seuils dans les données, surtout aux extrémités.',
  'guide.boxen.purpose': 'Il sert pour les grands jeux de données, quand une boîte à moustaches ordinaire cache trop de détails sur les valeurs extrêmes.',
  'guide.boxen.appearance': 'Chaque groupe ressemble à une pile de boîtes centrées sur la valeur du milieu. La boîte la plus large contient la moitié centrale des données. Chaque boîte plus petite, plus loin du centre, contient une tranche plus fine des extrémités. L\'ensemble rappelle une pyramide à étages.',

  'guide.candlestick.definition': 'Un graphique en chandeliers montre comment un prix a évolué pendant chaque période, par exemple une journée.',
  'guide.candlestick.purpose': 'Il sert en finance à lire, pour chaque période, le prix d\'ouverture, le plus haut, le plus bas et le prix de clôture d\'une action ou d\'une devise.',
  'guide.candlestick.appearance': 'Le temps va de gauche à droite, avec une bougie par période. Chaque bougie a un corps épais entre le prix d\'ouverture et le prix de clôture. Des traits fins, appelés mèches, montent jusqu\'au plus haut et descendent jusqu\'au plus bas. Le corps a en général une couleur quand le prix a monté et une autre quand il a baissé.',

  'guide.candlestick_delta.definition': 'Un écart de référence en chandeliers compare chaque bougie d\'un graphique en chandeliers à une ligne de référence, par exemple une moyenne mobile.',
  'guide.candlestick_delta.purpose': 'Il sert à savoir de combien le prix était au-dessus ou en dessous de son niveau habituel à chaque période.',
  'guide.candlestick_delta.appearance': 'Il n\'est pas dessiné à part. Il lit les mêmes bougies que le graphique en chandeliers. Il donne chaque prix sous forme d\'écart avec la ligne de référence à ce moment-là.',

  'guide.chord.definition': 'Un diagramme de cordes montre les échanges ou les liens entre les membres d\'un même groupe, disposés autour d\'un cercle.',
  'guide.chord.purpose': 'Il sert à montrer qui échange combien avec qui. Par exemple, le commerce entre pays ou les migrations entre régions.',
  'guide.chord.appearance': 'Les membres forment des arcs sur le bord d\'un cercle. Des rubans courbes traversent l\'intérieur du cercle pour relier deux membres. Plus un ruban est large, plus l\'échange est important.',

  'guide.choropleth.definition': 'Une carte choroplèthe est une carte où chaque région est colorée selon une valeur.',
  'guide.choropleth.purpose': 'Elle sert à montrer comment une mesure change d\'un endroit à l\'autre. Par exemple, la population par pays ou le revenu par département.',
  'guide.choropleth.appearance': 'Elle ressemble à une carte ordinaire, avec des frontières autour des régions, comme des pays ou des départements. Chaque région est remplie d\'une teinte, en général plus foncée ou plus intense pour les valeurs élevées. Une légende explique l\'échelle.',

  'guide.contour.definition': 'Un graphique en courbes de niveau représente un relief de valeurs sur une surface plate. Il utilise des lignes qui relient les points de même valeur.',
  'guide.contour.purpose': 'Il sert pour des données qui varient sur deux dimensions. Par exemple, l\'altitude sur une carte de randonnée ou la température dans une région.',
  'guide.contour.appearance': 'Des anneaux fermés et ondulés sont dessinés les uns dans les autres, comme autour d\'une colline sur une carte de randonnée. Chaque anneau correspond à une valeur. Là où les anneaux sont serrés, la valeur change vite. Là où ils sont espacés, elle change doucement.',

  'guide.diverging_bar.definition': 'Un diagramme à barres divergentes montre des barres qui partent d\'une ligne centrale dans deux directions opposées.',
  'guide.diverging_bar.purpose': 'Il sert à comparer deux côtés opposés. Par exemple, les réponses « d\'accord » et « pas d\'accord », ou les hommes et les femmes dans une pyramide des âges.',
  'guide.diverging_bar.appearance': 'Une ligne passe au milieu. Pour chaque catégorie, une barre part vers la gauche et une autre vers la droite. La longueur de chaque barre donne sa valeur, et le côté indique à quel groupe elle appartient.',

  'guide.dodged_bar.definition': 'Un diagramme à barres groupées place plusieurs barres côte à côte dans chaque catégorie.',
  'guide.dodged_bar.purpose': 'Il sert à comparer des sous-groupes à l\'intérieur de chaque catégorie. Par exemple, les ventes de plusieurs produits chaque mois.',
  'guide.dodged_bar.appearance': 'Le long de l\'axe des catégories, on trouve de petits groupes de barres. Chaque groupe contient une barre par sous-groupe. Les barres sont collées les unes aux autres, partent de la même base et ont en général des couleurs différentes.',

  'guide.dot.definition': 'Un diagramme à points représente un nombre par catégorie, sous forme d\'un seul point.',
  'guide.dot.purpose': 'Il sert, comme un diagramme à barres, à comparer des valeurs entre catégories. Mais il est plus léger, donc il reste lisible même avec beaucoup de catégories.',
  'guide.dot.appearance': 'Les catégories sont listées le long d\'un axe. Pour chacune, un seul point est placé à la hauteur de sa valeur sur l\'autre axe.',

  'guide.dumbbell.definition': 'Un graphique en haltères montre deux valeurs par catégorie, reliées par un trait.',
  'guide.dumbbell.purpose': 'Il sert à montrer l\'écart ou le changement entre deux valeurs. Par exemple, avant et après, ou cette année et l\'année dernière.',
  'guide.dumbbell.appearance': 'Chaque catégorie a deux points reliés par une barre droite, comme un haltère de salle de sport. La longueur de la barre donne la taille de l\'écart.',

  'guide.error_bar.definition': 'Un graphique à barres d\'erreur montre des valeurs avec le degré d\'incertitude de chacune.',
  'guide.error_bar.purpose': 'Il sert en sciences et en statistique à montrer une mesure et sa plage probable, comme un intervalle de confiance.',
  'guide.error_bar.appearance': 'Chaque valeur est un point ou le sommet d\'une barre. Un trait fin la traverse, d\'une limite basse à une limite haute. Il a souvent de petites barres aux deux bouts, comme la lettre I.',

  'guide.forest.definition': 'Un graphique en forêt montre les résultats de plusieurs études sur la même question, une ligne par étude, avec un résultat global combiné.',
  'guide.forest.purpose': 'Il sert en recherche médicale et en méta-analyse. Il permet de voir si les études sont d\'accord et quel est leur effet combiné.',
  'guide.forest.appearance': 'Les études sont listées de haut en bas. Chacune a un petit carré à son estimation et un trait horizontal qui montre son incertitude. Une ligne verticale marque « aucun effet ». En bas, un losange montre le résultat combiné.',

  'guide.gantt.definition': 'Un diagramme de Gantt représente des tâches sous forme de barres le long d\'une ligne du temps.',
  'guide.gantt.purpose': 'Il sert en gestion de projet à voir quand chaque tâche commence et finit, combien de temps elle dure et quelles tâches se chevauchent.',
  'guide.gantt.appearance': 'Le temps va de gauche à droite et les tâches sont listées de haut en bas. Chaque tâche est une barre horizontale qui commence à sa date de début et s\'arrête à sa date de fin.',

  'guide.funnel.definition': 'Un graphique en entonnoir montre combien d\'éléments restent à chaque étape d\'un processus.',
  'guide.funnel.purpose': 'Il sert à trouver où les éléments se perdent. Par exemple, combien de visiteurs d\'un site s\'inscrivent, puis combien achètent.',
  'guide.funnel.appearance': 'Les étapes sont empilées de haut en bas. Chaque étape est une barre centrée, et les barres rétrécissent en descendant. L\'ensemble ressemble à un entonnoir de cuisine.',

  'guide.gauge.definition': 'Une jauge montre une seule valeur par rapport à toute sa plage possible, comme un compteur de vitesse.',
  'guide.gauge.purpose': 'Elle sert à montrer où l\'on en est par rapport à un objectif, ou si une mesure est dans une zone bonne, d\'alerte ou mauvaise.',
  'guide.gauge.appearance': 'Un demi-cercle ou une barre droite représente toute la plage, du minimum au maximum, souvent découpée en zones de couleur. Une aiguille ou une partie remplie indique la valeur actuelle. Un repère marque parfois l\'objectif.',

  'guide.heat.definition': 'Une carte thermique est une grille de cases, où chaque case est colorée selon sa valeur.',
  'guide.heat.purpose': 'Elle sert à repérer des tendances dans un tableau de nombres. Par exemple, les heures et les jours les plus chargés.',
  'guide.heat.appearance': 'Des lignes et des colonnes forment une grille, comme un échiquier. Chaque case est remplie d\'une couleur, en général plus foncée ou plus chaude pour les valeurs élevées. Une légende explique l\'échelle.',

  'guide.hexbin.definition': 'Un diagramme à hexagones découpe un nuage de points en cases à six côtés et compte les points dans chaque case.',
  'guide.hexbin.purpose': 'Il sert quand les points sont si nombreux qu\'ils se superposent. Il montre où ils sont le plus serrés.',
  'guide.hexbin.appearance': 'La zone du graphique est couverte d\'hexagones, comme un rayon de miel. Chaque hexagone est coloré selon le nombre de points qu\'il contient, plus foncé quand il y en a plus.',

  'guide.hist.definition': 'Un histogramme montre comment une série de nombres se répartit. Il compte combien de valeurs tombent dans chaque intervalle.',
  'guide.hist.purpose': 'Il sert à voir la forme des données : où se trouvent la plupart des valeurs, à quel point elles sont dispersées, et si elles penchent d\'un côté.',
  'guide.hist.appearance': 'Des barres debout sont collées les unes aux autres, sans espace. Chaque barre couvre un intervalle de valeurs sur l\'axe du bas. Sa hauteur indique combien de valeurs tombent dans cet intervalle.',

  'guide.line.definition': 'Un graphique linéaire relie une suite de valeurs par une ligne, en général dans l\'ordre du temps.',
  'guide.line.purpose': 'Il sert à montrer des tendances. Par exemple, l\'évolution de la température ou du cours d\'une action au fil des jours ou des années.',
  'guide.line.appearance': 'Le temps, ou une autre valeur ordonnée, va de gauche à droite. La ligne monte quand les valeurs augmentent et descend quand elles baissent. Plusieurs lignes peuvent partager le même graphique, une par série.',

  'guide.lollipop.definition': 'Un graphique en sucettes représente un nombre par catégorie, sous forme d\'une fine tige terminée par un point.',
  'guide.lollipop.purpose': 'Il sert, comme un diagramme à barres, à comparer des valeurs entre catégories, avec un aspect plus léger.',
  'guide.lollipop.appearance': 'Depuis une même base, un trait fin s\'élève pour chaque catégorie. Il se termine par un point rond à sa valeur, comme une sucette sur son bâton.',

  'guide.manhattan.definition': 'Un graphique de Manhattan montre les résultats de tests faits sur de nombreuses positions d\'un génome, avec un point par position.',
  'guide.manhattan.purpose': 'Il sert en génétique à trouver les quelques endroits fortement liés à un caractère ou à une maladie.',
  'guide.manhattan.appearance': 'Les positions vont de gauche à droite, regroupées par chromosome avec des couleurs alternées. La hauteur montre la force du signal. La plupart des points restent bas, et quelques tours se dressent très haut, comme les gratte-ciel de Manhattan.',

  'guide.mosaic.definition': 'Un diagramme en mosaïque montre comment deux catégories se combinent. La surface de chaque tuile correspond à la part de chaque combinaison.',
  'guide.mosaic.purpose': 'Il sert à explorer les liens dans un tableau de comptages. Par exemple, la survie des passagers selon leur classe.',
  'guide.mosaic.appearance': 'Un rectangle est découpé en colonnes, dont la largeur correspond à la taille de chaque groupe. Chaque colonne est ensuite découpée de haut en bas en tuiles, dont la hauteur correspond à la part de chaque sous-groupe.',

  'guide.network.definition': 'Un diagramme de réseau représente des éléments par des points et les liens entre eux par des traits.',
  'guide.network.purpose': 'Il sert à montrer des relations, comme des amitiés entre personnes ou des liens entre pages web. Il aide aussi à trouver les éléments les plus connectés.',
  'guide.network.appearance': 'De petits cercles, appelés nœuds, sont répartis sur la page. Des traits, appelés liens, relient des paires de nœuds. Les éléments très connectés se trouvent souvent au centre, avec des traits qui partent dans tous les sens.',

  'guide.stacked_normalized_bar.definition': 'Un diagramme à barres empilées normalisées représente chaque catégorie par une barre de même longueur totale, découpée en pourcentages.',
  'guide.stacked_normalized_bar.purpose': 'Il sert à comparer des proportions entre catégories. Par exemple, la part de chaque tranche d\'âge dans plusieurs pays.',
  'guide.stacked_normalized_bar.appearance': 'Toutes les barres ont la même longueur, qui vaut 100 pour cent. Chaque barre est divisée en segments de couleur mis bout à bout. La taille de chaque segment donne la part de cet élément.',

  'guide.stacked_normalized_area.definition': 'Un graphique en aires empilées normalisées montre comment les parts de plusieurs éléments d\'un tout évoluent dans le temps.',
  'guide.stacked_normalized_area.purpose': 'Il sert à suivre des proportions au fil du temps. Par exemple, la part de chaque source d\'énergie chaque année.',
  'guide.stacked_normalized_area.appearance': 'Le graphique est un rectangle plein, de 0 à 100 pour cent. Des bandes de couleur sont empilées les unes sur les autres et le remplissent toujours entièrement. Une bande s\'épaissit quand sa part augmente et s\'amincit quand elle diminue.',

  'guide.parallel_coordinates.definition': 'Un graphique en coordonnées parallèles montre des éléments décrits par de nombreuses mesures, avec une ligne par élément.',
  'guide.parallel_coordinates.purpose': 'Il sert à comparer des éléments sur beaucoup de variables à la fois, et à trouver des groupes d\'éléments semblables.',
  'guide.parallel_coordinates.appearance': 'Plusieurs axes verticaux sont placés côte à côte, un par mesure. Chaque élément est une ligne en zigzag qui croise chaque axe à sa valeur pour cette mesure.',

  'guide.pie.definition': 'Un diagramme circulaire montre comment un tout se partage en parts, comme les tranches d\'un cercle.',
  'guide.pie.purpose': 'Il sert à montrer les parts d\'un total. Par exemple, comment un budget se répartit entre les services.',
  'guide.pie.appearance': 'Un cercle est découpé en parts depuis son centre, comme une tarte ou un camembert. Plus la part est grande, plus la tranche est large. Toutes les tranches ensemble forment le cercle complet.',

  'guide.polar_area.definition': 'Un diagramme en aires polaires, aussi appelé diagramme en rose, représente des valeurs par des secteurs de même angle qui s\'étirent plus ou moins loin du centre.',
  'guide.polar_area.purpose': 'Il sert à comparer des valeurs pour des catégories qui reviennent en cycle, comme les mois de l\'année ou les directions de la boussole.',
  'guide.polar_area.appearance': 'Des secteurs s\'ouvrent en éventail depuis un même centre, tous avec le même angle, comme les pétales d\'une fleur. Plus un secteur va loin du centre, plus sa valeur est grande.',

  'guide.radar.definition': 'Un graphique radar, aussi appelé graphique en toile d\'araignée, montre plusieurs mesures d\'un même élément sur des axes disposés en cercle.',
  'guide.radar.purpose': 'Il sert à comparer les points forts et les points faibles sur plusieurs qualités. Par exemple, les compétences d\'un joueur.',
  'guide.radar.appearance': 'Des rayons partent d\'un point central, un par mesure, comme les rayons d\'une roue. Chaque valeur est un point sur son rayon, plus loin du centre quand elle est plus élevée. Les points sont reliés en une forme fermée, comme une toile d\'araignée.',

  'guide.ridgeline.definition': 'Un graphique en lignes de crête montre la répartition de plusieurs groupes par des courbes douces, empilées les unes au-dessus des autres.',
  'guide.ridgeline.purpose': 'Il sert à comparer la forme des données entre de nombreux groupes. Par exemple, les températures de chaque mois.',
  'guide.ridgeline.appearance': 'Chaque groupe a une courbe en forme de colline, plus haute là où les valeurs sont fréquentes. Les courbes sont empilées vers le bas de la page et se chevauchent un peu, comme des crêtes de montagnes vues de loin.',

  'guide.roc.definition': 'Une courbe ROC montre à quel point un test ou un modèle de prédiction distingue bien deux résultats, par exemple malade et en bonne santé.',
  'guide.roc.purpose': 'Elle sert à juger un classificateur et à choisir un seuil. Ce seuil équilibre les vrais cas détectés et les fausses alertes.',
  'guide.roc.appearance': 'Une courbe monte du coin en bas à gauche jusqu\'au coin en haut à droite d\'un carré. Une ligne en diagonale représente le hasard. Plus la courbe se rapproche du coin en haut à gauche, meilleur est le modèle.',

  'guide.rug.definition': 'Un diagramme en tapis marque chaque observation par un petit trait le long d\'un axe.',
  'guide.rug.purpose': 'Il sert à montrer exactement où tombent les valeurs et où elles se regroupent. Il accompagne souvent un autre graphique.',
  'guide.rug.appearance': 'Le long d\'un bord du graphique, on trouve une rangée de petits traits, comme la frange d\'un tapis. Chaque trait est une valeur. Les zones denses ressemblent à des poils serrés.',

  'guide.sankey.definition': 'Un diagramme de Sankey montre comment une quantité circule d\'un ensemble d\'étapes au suivant.',
  'guide.sankey.purpose': 'Il sert à suivre d\'où viennent les choses et où elles vont. Par exemple, l\'énergie de ses sources jusqu\'à ses usages, ou l\'argent à travers un budget.',
  'guide.sankey.appearance': 'Des blocs, appelés nœuds, sont rangés en colonnes de gauche à droite. Des bandes coulent d\'un nœud à l\'autre. La largeur de chaque bande montre la quantité qui y passe.',

  'guide.point.definition': 'Un nuage de points montre le lien entre deux nombres, avec un point par élément.',
  'guide.point.purpose': 'Il sert à voir si deux mesures sont liées, comme la taille et le poids. Il aide aussi à repérer des groupes et des points inhabituels.',
  'guide.point.appearance': 'Des points sont répartis sur une surface plate. La position de gauche à droite de chaque point donne une valeur, et sa position de bas en haut donne l\'autre. Si les points forment une bande qui monte, les deux valeurs ont tendance à augmenter ensemble.',

  'guide.smooth.definition': 'Un graphique linéaire lissé trace une courbe à travers les points de données pour montrer leur tendance générale.',
  'guide.smooth.purpose': 'Il sert à voir la direction d\'ensemble de données bruitées, sans être distrait par chaque hausse et chaque baisse.',
  'guide.smooth.appearance': 'Une seule courbe douce va de gauche à droite, au milieu des données. Elle ne touche pas chaque point. Elle est souvent tracée par-dessus un nuage de points, parfois entourée d\'une bande ombrée.',

  'guide.sunflower.definition': 'Un diagramme en tournesol est un nuage de points où les points répétés au même endroit sont dessinés en une seule marque avec des pétales.',
  'guide.sunflower.purpose': 'Il sert quand de nombreuses observations ont exactement les mêmes valeurs. Ainsi, le nombre d\'observations à chaque endroit reste visible.',
  'guide.sunflower.appearance': 'Il ressemble à un nuage de points, mais certains points ont de petits traits qui en sortent, comme les pétales d\'une fleur. Le nombre de pétales correspond au nombre d\'observations à cet endroit.',

  'guide.stacked_bar.definition': 'Un diagramme à barres empilées représente chaque catégorie par une barre faite de plusieurs parties posées les unes sur les autres.',
  'guide.stacked_bar.purpose': 'Il sert à montrer à la fois le total de chaque catégorie et sa composition. Par exemple, les ventes totales réparties par produit.',
  'guide.stacked_bar.appearance': 'Les barres sont côte à côte. Chaque barre est divisée en segments de couleur, posés les uns sur les autres. La hauteur totale de la barre donne le total, et chaque segment est une partie.',

  'guide.stacked_area.definition': 'Un graphique en aires empilées montre plusieurs quantités dans le temps, empilées les unes sur les autres.',
  'guide.stacked_area.purpose': 'Il sert à montrer comment un total évolue dans le temps et ce que chaque partie y apporte.',
  'guide.stacked_area.appearance': 'Des bandes de couleur sont superposées de bas en haut, chacune posée sur celle du dessous. Le bord supérieur de la bande la plus haute donne le total. L\'épaisseur de chaque bande donne la quantité de cette partie.',

  'guide.step.definition': 'Un graphique en escalier est un graphique linéaire qui avance par paliers plats au lieu de lignes en pente.',
  'guide.step.purpose': 'Il sert pour des valeurs qui restent stables un moment puis font un saut. Par exemple, des prix, des taux d\'intérêt ou des comptages.',
  'guide.step.appearance': 'La ligne reste à plat, puis monte ou descend tout droit, puis reste à plat de nouveau, comme un escalier vu de profil.',

  'guide.survival.definition': 'Une courbe de survie montre, au fil du temps, la part d\'un groupe qui n\'a pas encore connu un événement.',
  'guide.survival.purpose': 'Elle sert en médecine et en ingénierie à comparer combien de temps durent des personnes ou des machines. Par exemple, des patients qui suivent deux traitements.',
  'guide.survival.appearance': 'La ligne part d\'en haut à gauche, à 100 pour cent. Elle descend d\'une marche vers la droite à chaque événement. Une courbe qui reste haute plus longtemps indique une meilleure survie. De petites marques peuvent signaler les personnes qui ont quitté l\'étude.',

  'guide.icicle.definition': 'Un diagramme en stalactites montre une hiérarchie, comme des dossiers et des fichiers, sous forme de couches de rectangles.',
  'guide.icicle.purpose': 'Il sert à voir comment un tout se divise en parties, puis ces parties en parties plus petites.',
  'guide.icicle.appearance': 'Le tout est une longue barre en haut. En dessous, elle est découpée en parties du niveau suivant, et chacune est découpée à son tour plus bas, comme des stalactites qui pendent d\'un plafond. Plus un morceau est large, plus il est grand.',

  'guide.sunburst.definition': 'Un diagramme en rayons de soleil montre une hiérarchie sous forme d\'anneaux autour d\'un centre.',
  'guide.sunburst.purpose': 'Il sert à voir comment un tout se divise en parties sur plusieurs niveaux. Par exemple, le budget d\'une entreprise par service puis par équipe.',
  'guide.sunburst.appearance': 'Le cercle du centre représente le tout. Chaque anneau vers l\'extérieur est le niveau suivant, découpé en arcs. Chaque arc se trouve juste à l\'extérieur de son parent. Plus un arc est large, plus sa part est grande.',

  'guide.tree.definition': 'Une arborescence montre une hiérarchie sous forme de cases reliées par des traits, d\'une racine jusqu\'à ses branches.',
  'guide.tree.purpose': 'Elle sert à montrer une structure, comme un organigramme, un arbre généalogique ou une suite de décisions.',
  'guide.tree.appearance': 'Un élément se trouve en haut ou à gauche. Des traits partent de lui vers ses enfants, qui se ramifient à leur tour vers les leurs, comme un arbre à l\'envers.',

  'guide.pack.definition': 'Un diagramme à cercles imbriqués montre une hiérarchie sous forme de cercles placés à l\'intérieur d\'autres cercles.',
  'guide.pack.purpose': 'Il sert à montrer des groupes dans des groupes, avec leur taille. Par exemple, des pays à l\'intérieur des continents.',
  'guide.pack.appearance': 'Un grand cercle contient des cercles plus petits, qui peuvent eux-mêmes en contenir d\'encore plus petits, comme des bulles dans des bulles. La taille de chaque cercle montre sa valeur.',

  'guide.treemap.definition': 'Une carte arborescente montre une hiérarchie sous forme de rectangles imbriqués. La surface de chaque rectangle correspond à sa valeur.',
  'guide.treemap.purpose': 'Elle sert à voir quelles parties d\'un tout sont les plus grandes. Par exemple, quels dossiers prennent le plus de place sur le disque.',
  'guide.treemap.appearance': 'Un grand rectangle est pavé de rectangles plus petits, comme un patchwork. Les grandes valeurs ont de grandes tuiles. Les tuiles d\'un même groupe sont regroupées dans une tuile plus grande.',

  'guide.violin_box.definition': 'Un diagramme en violon avec boîte à moustaches est une boîte à moustaches dessinée à l\'intérieur d\'un diagramme en violon. Elle résume chaque groupe avec cinq valeurs.',
  'guide.violin_box.purpose': 'Il sert à lire, pour chaque groupe, la valeur la plus basse, le premier quart, le milieu, le troisième quart et la valeur la plus haute, en plus de la forme du violon.',
  'guide.violin_box.appearance': 'À l\'intérieur de chaque violon se trouve une boîte étroite, avec une marque à la valeur du milieu. De fines moustaches montent et descendent jusqu\'aux valeurs la plus basse et la plus haute.',

  'guide.violin_kde.definition': 'Un diagramme en violon montre la forme des données d\'un groupe par un contour doux, symétrique.',
  'guide.violin_kde.purpose': 'Il sert à comparer la répartition de plusieurs groupes. Il montre où les valeurs sont fréquentes et où elles sont rares.',
  'guide.violin_kde.appearance': 'Chaque groupe a une forme large là où il y a beaucoup de valeurs et étroite là où il y en a peu. La forme est identique des deux côtés d\'une ligne centrale. Elle ressemble souvent à un violon ou à un vase.',

  'guide.volcano.definition': 'Un graphique en volcan montre, pour de nombreux éléments à la fois, l\'ampleur d\'un changement et son degré de signification statistique.',
  'guide.volcano.purpose': 'Il sert en biologie à repérer les gènes ou les protéines qui changent fortement et de façon fiable entre deux conditions.',
  'guide.volcano.appearance': 'Les points forment une silhouette de volcan en éruption. La position de gauche à droite donne la taille et le sens du changement, et la hauteur donne la signification. Les éléments intéressants se trouvent dans les coins en haut à gauche et en haut à droite.',

  'guide.waterfall.definition': 'Un graphique en cascade montre comment une valeur de départ change, par une suite de hausses et de baisses, jusqu\'à une valeur finale.',
  'guide.waterfall.purpose': 'Il sert à expliquer un total étape par étape. Par exemple, comment les recettes et les coûts aboutissent au bénéfice.',
  'guide.waterfall.appearance': 'La première barre part de la base. Chaque barre suivante flotte : elle commence là où la précédente s\'est arrêtée, et monte pour une hausse ou descend pour une baisse, comme des marches. La dernière barre repart de la base et montre le total final.',

  'guide.word_cloud.definition': 'Un nuage de mots montre les mots d\'un texte. Les mots les plus fréquents ou les plus importants sont écrits en plus grand.',
  'guide.word_cloud.purpose': 'Il sert à se faire vite une idée des grands thèmes d\'un texte, de réponses à une enquête ou de messages sur les réseaux sociaux.',
  'guide.word_cloud.appearance': 'Les mots sont serrés les uns contre les autres, en différentes tailles et parfois dans différents sens. Les mots les plus grands sont les plus fréquents.',
} satisfies Partial<Record<MessageKey, string>>;
