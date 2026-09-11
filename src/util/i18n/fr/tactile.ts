import type { MessageKey } from '../index';

export const tactile = {
  'tactile.viewWholePlot': 'Graphique entier',
  'tactile.viewZoomed': 'Zoom {zoom}x, centré à {x} % en largeur et {y} % en hauteur',
  'tactile.viewEmpty': '{view} ; rien n\'est visible',
  'tactile.viewUnchanged': '{view} ; les picots sont inchangés',

  'tactile.noView': 'Rien n\'est encore affiché sur l\'afficheur tactile',
  'tactile.zoomAtClosest': 'Zoom maximal déjà atteint',
  'tactile.zoomAtWholePlot': 'Le graphique entier est déjà affiché',
  'tactile.panWholePlot': 'Le graphique entier est déjà affiché ; faites un zoom avant pour vous déplacer',
  'tactile.panEdgeUp': 'Plus rien à afficher au-dessus',
  'tactile.panEdgeDown': 'Plus rien à afficher en dessous',
  'tactile.panEdgeLeft': 'Plus rien à afficher à gauche',
  'tactile.panEdgeRight': 'Plus rien à afficher à droite',
  'tactile.brailleOff': 'Activez le braille pour utiliser l\'afficheur tactile',
  'tactile.notConnected': 'Aucun afficheur tactile n\'est connecté',

  'tactile.lineWholeShown': 'La ligne entière est déjà affichée',
  'tactile.lineStart': 'Début de la ligne',
  'tactile.lineEnd': 'Fin de la ligne',
  'tactile.linePart': 'Partie {index} sur {total} de la ligne',
  'tactile.lineUncontracted': 'Le braille abrégé n\'est pas disponible, la ligne de texte de l\'afficheur tactile est donc en braille intégral',

  'tactile.deviceDisconnected': 'DotPad déconnecté',
  'tactile.deviceNoBluetooth': 'Cette page ne peut pas joindre un DotPad par Bluetooth. Web Bluetooth nécessite un navigateur Chromium et une page, ou un iframe, autorisée à l\'utiliser.',
  'tactile.deviceNoUsb': 'Cette page ne peut pas joindre un DotPad par USB. Web Serial nécessite un navigateur Chromium sur ordinateur et une page, ou un iframe, autorisée à l\'utiliser.',
  'tactile.deviceNoSdk': 'Le SDK DotPad est introuvable sur cette page.',
  'tactile.deviceNoneSelected': 'Aucun DotPad n\'a été sélectionné.',
  'tactile.deviceConnectFailed': 'Impossible de se connecter au DotPad.',
  'tactile.deviceNotPermitted': 'Cette page n\'est pas autorisée à joindre un DotPad. Elle doit être servie en HTTPS, et un iframe a besoin de l\'attribut allow correspondant.',
} satisfies Partial<Record<MessageKey, string>>;
