import type { MessageKey } from '../index';

/** Spanish renderings of the rotor: navigation mode names, and the boundary messages each mode speaks. */
export const rotor = {
  // Mode names, announced when the rotor lands on a mode.
  'rotor.higherValueMode': 'NAVEGACIÓN POR VALORES MÁS ALTOS',
  'rotor.lowerValueMode': 'NAVEGACIÓN POR VALORES MÁS BAJOS',
  'rotor.dataMode': 'NAVEGACIÓN POR PUNTOS DE DATOS',
  'rotor.rowColMode': 'NAVEGACIÓN POR FILAS Y COLUMNAS',
  'rotor.gridMode': 'NAVEGACIÓN POR CUADRÍCULA',
  'rotor.intersectionMode': 'NAVEGACIÓN POR PUNTOS DE INTERSECCIÓN',
  'rotor.pointMode': 'NAVEGACIÓN POR PUNTOS',
  'rotor.gridModeDimensions': 'NAVEGACIÓN POR CUADRÍCULA: CUADRÍCULA DE {rows} POR {cols}',

  // Directions, and the nouns the boundary messages name. The vertical
  // directions are adverbs so "más {direction} del valor actual" reads as
  // "más arriba del valor actual"; the horizontal ones are the sides.
  'rotor.directionAbove': 'arriba',
  'rotor.directionBelow': 'abajo',
  'rotor.directionLeft': 'izquierda',
  'rotor.directionRight': 'derecha',
  'rotor.lowerValueNoun': 'valor más bajo',
  'rotor.higherValueNoun': 'valor más alto',
  'rotor.pointNoun': 'punto',
  'rotor.gridValueNoun': 'valor de cuadrícula',

  // Nothing further in that direction. "No hay" takes a singular or a plural
  // noun alike, so every unit noun fits without an article.
  'rotor.noneFoundVerticalTerse': 'No hay {noun} {direction}',
  'rotor.noneFoundVerticalVerbose': 'No hay {noun} más {direction} del valor actual.',
  'rotor.noneFoundHorizontalTerse': 'No hay {noun} a la {direction}',
  'rotor.noneFoundHorizontalVerbose': 'No hay {noun} a la {direction} del valor actual.',

  // Modes that navigate along one axis only.
  'rotor.filterVerticalUnavailableTerse': 'Arriba y abajo no disponibles en el modo de {noun}',
  'rotor.filterVerticalUnavailableVerbose': 'La navegación hacia arriba y hacia abajo no está disponible en el modo de {noun}.',
  'rotor.intersectionVerticalUnavailableTerse': 'Arriba y abajo no disponibles en el modo de intersección',
  'rotor.intersectionVerticalUnavailableVerbose': 'La navegación hacia arriba y hacia abajo no está disponible en el modo de puntos de intersección.',

  // Intersection mode.
  'rotor.intersectionUnavailableTerse': 'Modo de intersección no disponible',
  'rotor.intersectionUnavailableVerbose': 'La navegación por intersecciones no está disponible en el contexto actual.',
  'rotor.noIntersectionTerse': 'No hay intersección a la {direction}',
  'rotor.noIntersectionVerbose': 'No hay intersección a la {direction} del punto actual.',
} satisfies Partial<Record<MessageKey, string>>;
