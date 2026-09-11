/** The rotor: navigation mode names, and the boundary messages each mode speaks. */
export const rotor = {
  // Mode names, announced when the rotor lands on a mode.
  'rotor.higherValueMode': 'HIGHER VALUE NAVIGATION',
  'rotor.lowerValueMode': 'LOWER VALUE NAVIGATION',
  'rotor.dataMode': 'DATA POINT NAVIGATION',
  'rotor.rowColMode': 'ROW AND COLUMN NAVIGATION',
  'rotor.gridMode': 'GRID NAVIGATION',
  'rotor.intersectionMode': 'INTERSECTING POINT NAVIGATION',
  'rotor.pointMode': 'POINT NAVIGATION',
  'rotor.gridModeDimensions': 'GRID NAVIGATION: {rows}×{cols} GRID',

  // Directions, and the nouns the boundary messages name.
  'rotor.directionAbove': 'above',
  'rotor.directionBelow': 'below',
  'rotor.directionLeft': 'left',
  'rotor.directionRight': 'right',
  'rotor.lowerValueNoun': 'lower value',
  'rotor.higherValueNoun': 'higher value',
  'rotor.pointNoun': 'point',
  'rotor.gridValueNoun': 'grid value',

  // Nothing further in that direction.
  'rotor.noneFoundVerticalTerse': 'No {noun} found {direction}',
  'rotor.noneFoundVerticalVerbose': 'No {noun} found {direction} the current value.',
  'rotor.noneFoundHorizontalTerse': 'No {noun} found on the {direction}',
  'rotor.noneFoundHorizontalVerbose': 'No {noun} found to the {direction} of the current value.',

  // Modes that navigate along one axis only.
  'rotor.filterVerticalUnavailableTerse': 'Up/down unavailable in {noun} mode',
  'rotor.filterVerticalUnavailableVerbose': 'Up and down navigation is not available in {noun} mode.',
  'rotor.intersectionVerticalUnavailableTerse': 'Up/down unavailable in intersection mode',
  'rotor.intersectionVerticalUnavailableVerbose': 'Up and down navigation is not available in intersection point mode.',

  // Intersection mode.
  'rotor.intersectionUnavailableTerse': 'Intersection mode unavailable',
  'rotor.intersectionUnavailableVerbose': 'Intersection navigation is not available in the current context.',
  'rotor.noIntersectionTerse': 'No intersection to the {direction}',
  'rotor.noIntersectionVerbose': 'No intersection found to the {direction} of the current point.',
} as const;
