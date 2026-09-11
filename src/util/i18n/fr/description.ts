import type { MessageKey } from '../index';

export const description = {
  'description.statOrientation': 'Orientation',
  'description.statSubtitle': 'Sous-titre',
  'description.statCaption': 'Légende',
  'description.statCurrentlyOn': 'Position actuelle',
  'description.statChartTypes': 'Types de graphique',
  'description.multiPanelFigure': 'Figure à plusieurs panneaux',
  'description.valueInfinity': 'infini',
  'description.valueNegativeInfinity': 'moins l\'infini',
  'description.subplotPosition': 'sous-graphique {index} sur {total}',
  'description.chartTypeCount': '{kind} ({count})',

  'description.title': 'Description du graphique',
  'description.close': 'Fermer',
  'description.chartTypePrefix': 'Type de graphique : ',
  'description.titleLabel': 'Titre',
  'description.titleLabelSubplot': 'Titre du sous-graphique',
  'description.titleLabelFigure': 'Titre de la figure',
  'description.axesHeading': 'Axes',
  'description.axisEntry': 'Axe {axis} : {label}',
  'description.summaryHeading': 'Résumé',
  'description.subplotsHeading': 'Sous-graphiques ({count})',
  'description.subplotUnknown': 'inconnu',
  'description.subplotCurrent': ' (actuel)',

  'description.layersHeading': 'Couches ({count})',
  'description.showingLayer': 'Affichage de la couche {index} sur {total}',
  'description.layerHint': 'Utilisez les flèches gauche et droite pour passer d\'une couche à l\'autre et la barre d\'espace pour en ouvrir une.',
  'description.layerUpdated': 'Description mise à jour pour la couche {index} sur {total}',

  'description.rowOne': 'ligne',
  'description.rowMany': 'lignes',
  'description.tableCaption': 'Données : {total} {rows}',
  'description.tableCaptionTruncated': 'Données : {shown} {rows} affichées sur {total}',
  'description.tableShowMore': 'Afficher {count} {rows} de plus sur {total}',
  'description.tableColumn': 'Colonne {index}',
} satisfies Partial<Record<MessageKey, string>>;
