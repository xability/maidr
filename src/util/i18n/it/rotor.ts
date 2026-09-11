import type { MessageKey } from '../index';

export const rotor = {
  'rotor.higherValueMode': 'NAVIGAZIONE PER VALORE SUPERIORE',
  'rotor.lowerValueMode': 'NAVIGAZIONE PER VALORE INFERIORE',
  'rotor.dataMode': 'NAVIGAZIONE PER PUNTI DATI',
  'rotor.rowColMode': 'NAVIGAZIONE PER RIGHE E COLONNE',
  'rotor.gridMode': 'NAVIGAZIONE A GRIGLIA',
  'rotor.intersectionMode': 'NAVIGAZIONE PER PUNTI DI INTERSEZIONE',
  'rotor.pointMode': 'NAVIGAZIONE PER PUNTI',
  'rotor.gridModeDimensions': 'NAVIGAZIONE A GRIGLIA: GRIGLIA {rows}×{cols}',

  'rotor.directionAbove': 'sopra',
  'rotor.directionBelow': 'sotto',
  'rotor.directionLeft': 'sinistra',
  'rotor.directionRight': 'destra',
  'rotor.lowerValueNoun': 'valore inferiore',
  'rotor.higherValueNoun': 'valore superiore',
  'rotor.pointNoun': 'punto',
  'rotor.gridValueNoun': 'valore della griglia',

  'rotor.noneFoundVerticalTerse': 'Nessun {noun} trovato {direction}',
  'rotor.noneFoundVerticalVerbose': 'Nessun {noun} trovato {direction} il valore corrente.',
  'rotor.noneFoundHorizontalTerse': 'Nessun {noun} trovato a {direction}',
  'rotor.noneFoundHorizontalVerbose': 'Nessun {noun} trovato a {direction} del valore corrente.',

  'rotor.filterVerticalUnavailableTerse': 'Su e giù non disponibili in modalità {noun}',
  'rotor.filterVerticalUnavailableVerbose': 'La navigazione su e giù non è disponibile in modalità {noun}.',
  'rotor.intersectionVerticalUnavailableTerse': 'Su e giù non disponibili in modalità intersezione',
  'rotor.intersectionVerticalUnavailableVerbose': 'La navigazione su e giù non è disponibile in modalità punti di intersezione.',

  'rotor.intersectionUnavailableTerse': 'Modalità intersezione non disponibile',
  'rotor.intersectionUnavailableVerbose': 'La navigazione per intersezioni non è disponibile nel contesto corrente.',
  'rotor.noIntersectionTerse': 'Nessuna intersezione a {direction}',
  'rotor.noIntersectionVerbose': 'Nessuna intersezione trovata a {direction} del punto corrente.',
} satisfies Partial<Record<MessageKey, string>>;
