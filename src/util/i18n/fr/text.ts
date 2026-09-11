import type { MessageKey } from '../index';

export const text = {
  // Reading fragments the per-point announcements are composed from. A label
  // is data the producer chose and may be of either gender or number, so the
  // readings name it with a colon rather than a verb that would have to agree.
  'text.labelIsValue': '{label} : {value}',
  'text.labelAreValues': '{label} : {values}',
  'text.labelIsRange': '{label} : de {min} à {max}',
  'text.rangeThrough': 'de {min} à {max}',
  'text.sectionLabel': '{section} {label}',
  'text.plotOfType': 'graphique de type {type}',
  'text.gridCell': 'Cellule ligne {row}, colonne {col}',

  // Layer navigation and the states with nothing to read.
  'text.layerOfSize': 'Couche {index} sur {size} : {identity}',
  'text.layerSwitchAt': '{layer} à {details}',
  'text.noAdditionalLayer': 'Aucune autre couche',
  'text.noPlotInfo': 'Aucune information de graphique à afficher',
  'text.noFigureInfo': 'Aucune information de figure à afficher',

  // The multi-panel figure lobby.
  'text.figureSingleType': 'Ceci est un graphique de type {type}',
  'text.figureMultiType': 'Ceci est un graphique multicouche contenant des graphiques de type {types}',
  'text.subplotOfSize': 'Sous-graphique {index} sur {size}',
  'text.subplotOfSizeTitled': 'Sous-graphique {index} sur {size}, {title}',
  'text.subplotIndex': 'Sous-graphique {index}',
  'text.figureLobbyDetails': '{position} : {details}. {prompt}',
  'text.pressEnterToSelect': 'Appuyez sur Enter pour sélectionner ce sous-graphique.',

  // Entering, refusing, and leaving a subplot.
  'text.enteredSubplot': 'Entrée dans le sous-graphique {index} sur {size}.',
  'text.enteredSubplotTitled': 'Entrée dans le sous-graphique {index} sur {size}, {title}.',
  'text.enteredSubplotTyped': 'Entrée dans le sous-graphique {index} sur {size}, graphique de type {type}.',
  'text.enteredSubplotTitledTyped': 'Entrée dans le sous-graphique {index} sur {size}, {title}, graphique de type {type}.',
  'text.terseEmptySubplot': '{label}, vide',
  'text.subplotEmpty': 'Le sous-graphique {index} sur {size} est vide, rien à décrire.',
  'text.subplotEmptyTitled': 'Le sous-graphique {index} sur {size}, {title}, est vide, rien à décrire.',
  'text.figureTerse': 'Figure',
  'text.figureTerseTitled': 'Figure, {title}',
  'text.figureTerseSubplot': 'Figure, sous-graphique {index}',
  'text.returnedToFigure': 'Retour à la vue d\'ensemble de la figure.',
  'text.returnedToFigureSubplot': 'Retour à la vue d\'ensemble de la figure, sous-graphique {index} sur {size}.',
  'text.returnedToFigureSubplotTitled': 'Retour à la vue d\'ensemble de la figure, sous-graphique {index} sur {size}, {title}.',

  // Outlier sections. The section name is already plural ("Valeurs
  // aberrantes"), so the readings use a colon and read the same either way.
  'text.noOutliersFor': 'pas de {section} pour {label}',
  'text.outliersForOne': '{section} pour {label} : {values}',
  'text.outliersForMany': '{section} pour {label} : {values}',
  'text.terseNoOutliers': '{value}, pas de {section}',
  'text.terseOutliers': '{value}, {count} {section} {values}',

  // Share of a stack, and the uncertainty around a value.
  'text.shareOfTotal': '{percent} % du total',
  'text.intervalRange': 'intervalle de {min} à {max}',
  'text.intervalFrom': 'intervalle à partir de {min}',
  'text.intervalUpTo': 'intervalle jusqu\'à {max}',

  // Scatter grid cells.
  'text.noPoints': 'aucun point',
  'text.pointIsOne': 'le point est : {points}',
  'text.pointsAreMany': 'les points sont : {points}',
  'text.tersePoints': 'points : {points}',
  'text.noPointsInCell': 'Aucun point dans cette cellule',

  // Edges of the data and of the lobby.
  'text.noMoreData': 'Fin des données',
  'text.noMoreDataVerbose': 'Plus de données à afficher',
  'text.noMoreSubplots': 'Fin des sous-graphiques',
  'text.noMoreSubplotsVerbose': 'Plus de sous-graphiques à afficher',

  // Text mode.
  'text.textMode': 'Le mode texte est {mode}',
  'text.modeOff': 'désactivé',
  'text.modeTerse': 'concis',
  'text.modeVerbose': 'détaillé',
  'text.textModeOffHint': 'Le mode texte est désactivé. Pour l\'activer, appuyez sur la touche T.',

  // A candlestick's trend.
  'text.trendBull': 'haussier',
  'text.trendBear': 'baissier',
  'text.trendNeutral': 'neutre',

  // Review mode.
  'text.noInfoForReview': 'Aucune information à réviser',
  'text.reviewMode': 'La révision est {mode}',
  'text.reviewOn': 'activée',
  'text.reviewOff': 'désactivée',

  // Key names stay as they are; the words around them are translated.
  'text.modifierControl': 'Control',
  'text.modifierCommand': 'Command',
  'text.invalidKey': 'Touche non valide. Appuyez sur {modifier} barre oblique pour l\'aide clavier.',

  'text.brailleUnavailableHere': 'Le braille n\'est pas disponible ici. Appuyez d\'abord sur Enter pour sélectionner un sous-graphique.',

  // Label announcements. The trailing space of `text.subplotPrefix` is part of
  // the message: it is prepended to an announcement rather than joined with one.
  'text.subplotPrefix': 'Sous-graphique {index}, ',
  'text.figureAxisLabelIs': 'L\'étiquette de l\'axe {axis} de la figure est {label}',
  'text.axisLabelIs': 'L\'étiquette de l\'axe {axis} est {label}',
  'text.axisLabelUnavailable': 'L\'étiquette de l\'axe {axis} n\'est pas disponible',
  'text.unavailable': 'non disponible',
  'text.figureTitle': 'Titre de la figure',
  'text.subplotTitleIndexed': 'Titre du sous-graphique {index}',
  'text.subplotTitle': 'Titre du sous-graphique',
  'text.title': 'Titre',
  'text.noTitleAvailable': 'Aucun titre disponible',
  'text.subtitle': 'Sous-titre',
  'text.noSubtitleAvailable': 'Aucun sous-titre disponible',
  'text.caption': 'Légende',
  'text.noCaptionAvailable': 'Aucune légende disponible',

  // Position announcements.
  'text.notInChart': 'Pas dans un graphique, impossible d\'indiquer la position.',
  'text.indexOfSize': '{index} sur {size}',
  'text.positionIs': 'Position {position} sur {total}',
  'text.positionIsColumnRow': 'Position colonne {col} sur {cols}, ligne {row} sur {rows}',
  'text.positionInSection': 'Position {position} sur {total} dans {section}',
  'text.positionOfTotalWith': 'Position {position} sur {total}, {detail}',
  'text.level': 'Niveau',
  'text.violinOfTotal': 'Violon {index} sur {total}',
  'text.seriesOfTotal': '{noun} {index} sur {total}',
  'text.seriesNounLine': 'Ligne',
  'text.seriesNounObservation': 'Observation',
  'text.seriesNounCompetitor': 'Concurrent',
  'text.seriesNounSeries': 'Série',
  'text.columnRowPosition': 'Colonne {col} sur {cols}, ligne {row} sur {rows}',
  'text.wholeCircle': 'le cercle entier',
  'text.nearlyWholeCircle': 'presque tout le cercle',
  'text.atClockHour': 'à {hour} heures',
  'text.fromClockHourTo': 'de {start} heures à {end} heures',

  // Jumping to a layer's extreme value.
  'text.noMinimumValue': 'Aucune valeur minimale vers laquelle aller dans cette couche',
  'text.noMaximumValue': 'Aucune valeur maximale vers laquelle aller dans cette couche',
  'text.pointPosition': '{point}, {position} sur {total}',
} satisfies Partial<Record<MessageKey, string>>;
