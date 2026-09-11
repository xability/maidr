import type { MessageKey } from '../index';

export const rotor = {
  // Mode names, announced when the rotor lands on a mode.
  'rotor.higherValueMode': 'Navigation zu höheren Werten',
  'rotor.lowerValueMode': 'Navigation zu niedrigeren Werten',
  'rotor.dataMode': 'Datenpunktnavigation',
  'rotor.rowColMode': 'Zeilen- und Spaltennavigation',
  'rotor.gridMode': 'Rasternavigation',
  'rotor.intersectionMode': 'Schnittpunktnavigation',
  'rotor.pointMode': 'Punktnavigation',
  'rotor.gridModeDimensions': 'Rasternavigation: Raster mit {rows} mal {cols} Zellen',

  // Directions, and the nouns the boundary messages name. The nouns lead the
  // boundary sentences, so they are capitalised; the sentence shape
  // "{noun} {direction} nicht gefunden" works for every gender and number.
  'rotor.directionAbove': 'oberhalb',
  'rotor.directionBelow': 'unterhalb',
  'rotor.directionLeft': 'links',
  'rotor.directionRight': 'rechts',
  'rotor.lowerValueNoun': 'Niedrigerer Wert',
  'rotor.higherValueNoun': 'Höherer Wert',
  'rotor.pointNoun': 'Punkt',
  'rotor.gridValueNoun': 'Rasterwert',

  // Nothing further in that direction.
  'rotor.noneFoundVerticalTerse': '{noun} {direction} nicht gefunden',
  'rotor.noneFoundVerticalVerbose': '{noun} {direction} des aktuellen Werts nicht gefunden.',
  'rotor.noneFoundHorizontalTerse': '{noun} {direction} nicht gefunden',
  'rotor.noneFoundHorizontalVerbose': '{noun} {direction} vom aktuellen Wert nicht gefunden.',

  // Modes that navigate along one axis only.
  'rotor.filterVerticalUnavailableTerse': 'Auf und ab im Modus {noun} nicht verfügbar',
  'rotor.filterVerticalUnavailableVerbose': 'Die Navigation nach oben und unten ist im Modus {noun} nicht verfügbar.',
  'rotor.intersectionVerticalUnavailableTerse': 'Auf und ab im Schnittpunktmodus nicht verfügbar',
  'rotor.intersectionVerticalUnavailableVerbose': 'Die Navigation nach oben und unten ist im Schnittpunktmodus nicht verfügbar.',

  // Intersection mode.
  'rotor.intersectionUnavailableTerse': 'Schnittpunktmodus nicht verfügbar',
  'rotor.intersectionUnavailableVerbose': 'Die Schnittpunktnavigation ist im aktuellen Kontext nicht verfügbar.',
  'rotor.noIntersectionTerse': 'Kein Schnittpunkt {direction}',
  'rotor.noIntersectionVerbose': 'Kein Schnittpunkt {direction} vom aktuellen Punkt gefunden.',
} satisfies Partial<Record<MessageKey, string>>;
