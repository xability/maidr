import type { MessageKey } from '../index';

export const text = {
  // Reading fragments the per-point announcements are composed from. Every
  // clause of a verbose reading is one of these, joined with ", ".
  'text.labelIsValue': '{label} ist {value}',
  'text.labelAreValues': '{label} sind {values}',
  'text.labelIsRange': '{label} ist {min} bis {max}',
  'text.rangeThrough': '{min} bis {max}',
  'text.sectionLabel': '{section} {label}',
  // The plot type words under `model.plotType…` are bare type words
  // ("Balken"), so every surface that names a plot spells "Diagramm vom Typ".
  'text.plotOfType': 'Diagramm vom Typ {type}',
  'text.gridCell': 'Zelle Zeile {row}, Spalte {col}',

  // Layer navigation (Page Up / Page Down) and the states with nothing to read.
  'text.layerOfSize': 'Ebene {index} von {size}: {identity}',
  'text.layerSwitchAt': '{layer} bei {details}',
  'text.noAdditionalLayer': 'Keine weitere Ebene',
  'text.noPlotInfo': 'Keine Diagramminformationen zum Anzeigen',
  'text.noFigureInfo': 'Keine Abbildungsinformationen zum Anzeigen',

  // The multi-panel figure lobby: what a subplot is, and how to enter it.
  'text.figureSingleType': 'Dies ist ein Diagramm vom Typ {type}',
  'text.figureMultiType': 'Dies ist ein mehrschichtiges Diagramm mit den Typen {types}',
  'text.subplotOfSize': 'Teildiagramm {index} von {size}',
  'text.subplotOfSizeTitled': 'Teildiagramm {index} von {size}, {title}',
  'text.subplotIndex': 'Teildiagramm {index}',
  'text.figureLobbyDetails': '{position}: {details}. {prompt}',
  'text.pressEnterToSelect': 'Drücken Sie Enter, um dieses Teildiagramm auszuwählen.',

  // Entering a subplot, refusing to enter an empty one, and returning to the
  // lobby.
  'text.enteredSubplot': 'Teildiagramm {index} von {size} betreten.',
  'text.enteredSubplotTitled': 'Teildiagramm {index} von {size} betreten, {title}.',
  'text.enteredSubplotTyped': 'Teildiagramm {index} von {size} betreten, Diagramm vom Typ {type}.',
  'text.enteredSubplotTitledTyped': 'Teildiagramm {index} von {size} betreten, {title}, Diagramm vom Typ {type}.',
  'text.terseEmptySubplot': '{label}, leer',
  'text.subplotEmpty': 'Teildiagramm {index} von {size} ist leer, nichts zu beschreiben.',
  'text.subplotEmptyTitled': 'Teildiagramm {index} von {size}, {title} ist leer, nichts zu beschreiben.',
  'text.figureTerse': 'Abbildung',
  'text.figureTerseTitled': 'Abbildung, {title}',
  'text.figureTerseSubplot': 'Abbildung, Teildiagramm {index}',
  'text.returnedToFigure': 'Zurück zur Übersicht der Abbildung.',
  'text.returnedToFigureSubplot': 'Zurück zur Übersicht der Abbildung, Teildiagramm {index} von {size}.',
  'text.returnedToFigureSubplotTitled': 'Zurück zur Übersicht der Abbildung, Teildiagramm {index} von {size}, {title}.',

  // Box plot outlier sections. "Ausreißer" has the same form in the singular
  // and the plural, so the section names ("Ausreißer unten") fit both verbs.
  'text.noOutliersFor': 'keine {section} für {label}',
  'text.outliersForOne': '{section} für {label} ist {values}',
  'text.outliersForMany': '{section} für {label} sind {values}',
  'text.terseNoOutliers': '{value}, keine {section}',
  'text.terseOutliers': '{value}, {count} {section} {values}',

  // Facts announced after the point's own value: its share of a stack, and
  // the uncertainty drawn around it.
  'text.shareOfTotal': '{percent} % davon',
  'text.intervalRange': 'Intervall {min} bis {max}',
  'text.intervalFrom': 'Intervall ab {min}',
  'text.intervalUpTo': 'Intervall bis {max}',

  // Scatter grid cells: the points a cell holds, and entering one that has none.
  'text.noPoints': 'keine Punkte',
  'text.pointIsOne': 'Punkt ist: {points}',
  'text.pointsAreMany': 'Punkte sind: {points}',
  'text.tersePoints': 'Punkte: {points}',
  'text.noPointsInCell': 'Keine Punkte in dieser Zelle',

  // Reaching an edge of the data or of the lobby, in each verbosity.
  'text.noMoreData': 'Keine weiteren Daten',
  'text.noMoreDataVerbose': 'Keine weiteren Daten zum Anzeigen',
  'text.noMoreSubplots': 'Keine weiteren Teildiagramme',
  'text.noMoreSubplotsVerbose': 'Keine weiteren Teildiagramme zum Anzeigen',

  // Text mode itself.
  'text.textMode': 'Textmodus ist {mode}',
  'text.modeOff': 'aus',
  'text.modeTerse': 'knapp',
  'text.modeVerbose': 'ausführlich',
  'text.textModeOffHint': 'Der Textmodus ist aus. Drücken Sie die Taste T, um ihn einzuschalten.',

  // A candlestick's trend, which is a word rather than a measurement.
  'text.trendBull': 'bullisch',
  'text.trendBear': 'bärisch',
  'text.trendNeutral': 'neutral',

  // Review mode.
  'text.noInfoForReview': 'Keine Informationen zur Überprüfung',
  'text.reviewMode': 'Überprüfung ist {mode}',
  'text.reviewOn': 'an',
  'text.reviewOff': 'aus',

  // The modifier key as a reader hears it spoken, and the unassigned-key
  // warning that names it. The key names themselves are not translated.
  'text.modifierControl': 'Control',
  'text.modifierCommand': 'Command',
  'text.invalidKey': 'Ungültige Taste. Drücken Sie {modifier} Schrägstrich für die Tastaturhilfe.',

  // Offering the braille key where braille has nothing to encode.
  'text.brailleUnavailableHere': 'Braille ist hier nicht verfügbar. Drücken Sie Enter, um zuerst ein Teildiagramm auszuwählen.',

  // Label announcements. `text.subplotPrefix` keeps its trailing space: it is
  // prepended to an announcement rather than joined with one.
  'text.subplotPrefix': 'Teildiagramm {index}, ',
  'text.figureAxisLabelIs': 'Beschriftung der {axis}-Achse der Abbildung ist {label}',
  'text.axisLabelIs': 'Beschriftung der {axis}-Achse ist {label}',
  'text.axisLabelUnavailable': 'Beschriftung der {axis}-Achse ist nicht verfügbar',
  'text.unavailable': 'nicht verfügbar',
  'text.figureTitle': 'Titel der Abbildung',
  'text.subplotTitleIndexed': 'Titel von Teildiagramm {index}',
  'text.subplotTitle': 'Titel des Teildiagramms',
  'text.title': 'Titel',
  'text.noTitleAvailable': 'Kein Titel verfügbar',
  'text.subtitle': 'Untertitel',
  'text.noSubtitleAvailable': 'Kein Untertitel verfügbar',
  'text.caption': 'Bildunterschrift',
  'text.noCaptionAvailable': 'Keine Bildunterschrift verfügbar',

  // Position announcements, one shape per chart family.
  'text.notInChart': 'Nicht in einem Diagramm, Position kann nicht angezeigt werden.',
  'text.indexOfSize': '{index} von {size}',
  'text.positionIs': 'Position ist {position} von {total}',
  'text.positionIsColumnRow': 'Position ist Spalte {col} von {cols}, Zeile {row} von {rows}',
  'text.positionInSection': 'Position ist {position} von {total} in {section}',
  'text.positionOfTotalWith': 'Position ist {position} von {total}, {detail}',
  'text.level': 'Level',
  'text.violinOfTotal': 'Violine {index} von {total}',
  'text.seriesOfTotal': '{noun} {index} von {total}',
  'text.seriesNounLine': 'Linie',
  'text.seriesNounObservation': 'Beobachtung',
  'text.seriesNounCompetitor': 'Wettbewerber',
  'text.seriesNounSeries': 'Reihe',
  'text.columnRowPosition': 'Spalte {col} von {cols}, Zeile {row} von {rows}',
  'text.wholeCircle': 'der ganze Kreis',
  'text.nearlyWholeCircle': 'fast der ganze Kreis',
  'text.atClockHour': 'auf {hour} Uhr',
  'text.fromClockHourTo': 'von {start} Uhr bis {end} Uhr',

  // Jumping straight to a layer's extreme value.
  'text.noMinimumValue': 'In dieser Ebene gibt es keinen Minimalwert zum Anspringen',
  'text.noMaximumValue': 'In dieser Ebene gibt es keinen Maximalwert zum Anspringen',
  'text.pointPosition': '{point}, {position} von {total}',
} satisfies Partial<Record<MessageKey, string>>;
