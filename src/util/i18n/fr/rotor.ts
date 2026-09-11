import type { MessageKey } from '../index';

export const rotor = {
  // Mode names, announced when the rotor lands on a mode.
  'rotor.higherValueMode': 'NAVIGATION PAR VALEUR SUPÉRIEURE',
  'rotor.lowerValueMode': 'NAVIGATION PAR VALEUR INFÉRIEURE',
  'rotor.dataMode': 'NAVIGATION PAR POINT DE DONNÉES',
  'rotor.rowColMode': 'NAVIGATION PAR LIGNE ET COLONNE',
  'rotor.gridMode': 'NAVIGATION PAR GRILLE',
  'rotor.intersectionMode': 'NAVIGATION PAR POINT D\'INTERSECTION',
  'rotor.pointMode': 'NAVIGATION PAR POINT',
  'rotor.gridModeDimensions': 'NAVIGATION PAR GRILLE : GRILLE DE {rows} PAR {cols}',

  // Directions, and the nouns the boundary messages name. The nouns are of
  // mixed gender, so the boundary messages use "pas de", which agrees with none.
  'rotor.directionAbove': 'au-dessus',
  'rotor.directionBelow': 'en dessous',
  'rotor.directionLeft': 'gauche',
  'rotor.directionRight': 'droite',
  'rotor.lowerValueNoun': 'valeur inférieure',
  'rotor.higherValueNoun': 'valeur supérieure',
  'rotor.pointNoun': 'point',
  'rotor.gridValueNoun': 'valeur de grille',

  // Nothing further in that direction.
  'rotor.noneFoundVerticalTerse': 'Pas de {noun} {direction}',
  'rotor.noneFoundVerticalVerbose': 'Pas de {noun} {direction} de la valeur actuelle.',
  'rotor.noneFoundHorizontalTerse': 'Pas de {noun} à {direction}',
  'rotor.noneFoundHorizontalVerbose': 'Pas de {noun} à {direction} de la valeur actuelle.',

  // Modes that navigate along one axis only.
  'rotor.filterVerticalUnavailableTerse': 'Haut et bas indisponibles en mode {noun}',
  'rotor.filterVerticalUnavailableVerbose': 'La navigation vers le haut et le bas n\'est pas disponible en mode {noun}.',
  'rotor.intersectionVerticalUnavailableTerse': 'Haut et bas indisponibles en mode intersection',
  'rotor.intersectionVerticalUnavailableVerbose': 'La navigation vers le haut et le bas n\'est pas disponible en mode point d\'intersection.',

  // Intersection mode.
  'rotor.intersectionUnavailableTerse': 'Mode intersection indisponible',
  'rotor.intersectionUnavailableVerbose': 'La navigation par intersection n\'est pas disponible dans le contexte actuel.',
  'rotor.noIntersectionTerse': 'Aucune intersection à {direction}',
  'rotor.noIntersectionVerbose': 'Aucune intersection trouvée à {direction} du point actuel.',
} satisfies Partial<Record<MessageKey, string>>;
