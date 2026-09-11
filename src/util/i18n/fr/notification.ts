import type { MessageKey } from '../index';

export const notification = {
  // Autoplay speed.
  'notification.speedUp': 'Accélération',
  'notification.maxSpeed': 'Vitesse maximale',
  'notification.speedDown': 'Ralentissement',
  'notification.minSpeed': 'Vitesse minimale',
  'notification.resetSpeed': 'Vitesse réinitialisée',

  // Sonification.
  'notification.soundIs': 'Le son est {mode}',
  'notification.audioModeOff': 'désactivé',
  'notification.audioModeOn': 'activé',
  'notification.audioModeCombined': 'combiné',
  'notification.audioModeSeparate': 'séparé',

  // Braille.
  'notification.brailleIsOn': 'Le braille est activé',
  'notification.brailleIsOff': 'Le braille est désactivé',
  'notification.brailleNoInfo': 'Aucune information pour le braille',
  'notification.brailleNotSupported': 'Le braille n\'est pas pris en charge pour le type de graphique : {type}',
  'notification.brailleDisplay': 'Afficheur braille',

  // Monitor mode on live charts.
  'notification.monitoringLiveOnly': 'La surveillance n\'est disponible que pour les graphiques en direct',
  'notification.monitoringOn': 'Surveillance activée',
  'notification.monitoringOff': 'Surveillance désactivée',

  // High contrast.
  'notification.highContrastOn': 'Mode contraste élevé activé',
  'notification.highContrastOff': 'Mode contraste élevé désactivé',

  // Candlestick reference comparison (the virtual delta layer).
  'notification.deltaCandlestickOnly': 'La comparaison à la référence n\'est disponible que sur les graphiques en chandeliers.',
  'notification.deltaNeedsLineLayer': 'La comparaison à la référence n\'est disponible que sur les graphiques en chandeliers comportant une couche de lignes.',
  'notification.deltaReferenceUnavailable': 'La ligne de référence sélectionnée n\'est pas disponible.',
  'notification.deltaNoMatchingX': 'Aucune valeur x commune entre le graphique en chandeliers et {reference}.',
  'notification.deltaKeepingComparison': 'La comparaison actuelle est conservée : {reference} n\'atteint pas {x}. Placez-vous sur un chandelier couvert par cette ligne, puis choisissez-la de nouveau.',
  'notification.deltaNoComparisonAtX': 'Aucune comparaison à la référence à {x} : {reference} n\'atteint pas ce chandelier. Placez-vous sur un chandelier couvert par la moyenne mobile, puis appuyez sur Alt L.',
  'notification.deltaActivationFailed': 'La comparaison à la référence n\'a pas pu être activée ici.',
  'notification.deltaActivated': 'Comparaison à la référence activée : prix OHLC moins {reference}, {count} points, à partir de {field}. Les valeurs positives sont au-dessus de la ligne, les négatives en dessous. Utilisez les flèches gauche et droite pour passer d\'un chandelier à l\'autre, et les flèches haut et bas pour passer de l\'ouverture au plus haut, au plus bas et à la clôture. Appuyez sur Alt L pour désactiver la comparaison, sur G pour les extremums, et utilisez le rotor pour parcourir les points au-dessus, en dessous ou sur la ligne. Appuyez sur Escape pour revenir au graphique.',
  'notification.deltaClosed': 'Comparaison à la référence fermée. Retour à la couche du graphique. Appuyez sur Alt L pour comparer de nouveau.',
  'notification.deltaClosedByUpdate': 'Comparaison à la référence fermée par une mise à jour des données.',
  'notification.deltaNoReferenceChosen': 'Aucune ligne de référence choisie pour l\'instant. Utilisez la liste pour choisir une ligne de moyenne mobile et appuyez sur Enter pour comparer. Appuyez sur Escape pour annuler.',
  'notification.deltaTraceTitle': 'Prix OHLC contre {reference}',
  'notification.deltaYAxisLabel': 'Écart {axis}',

  // The reference-line picker.
  'notification.deltaPickerTitle': 'Comparer à une ligne de référence',
  'notification.deltaPickerClose': 'Fermer le sélecteur de référence',
  'notification.deltaPickerDescription': 'Choisissez une ligne de référence à laquelle comparer chaque chandelier. Utilisez les flèches haut et bas pour vous déplacer, puis appuyez sur Enter. Une fois la ligne choisie, appuyez sur Alt L pour activer ou désactiver la comparaison.',
  'notification.deltaPickerListLabel': 'Lignes de référence',
} satisfies Partial<Record<MessageKey, string>>;
