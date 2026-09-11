/**
 * Everything the text service, the review service and the announcing commands
 * say: the per-point readings, the lobby and layer navigation cues, the label
 * and position announcements, and the boundary messages.
 */
export const text = {
  // Reading fragments the per-point announcements are composed from. Every
  // clause of a verbose reading is one of these, joined with ", ".
  'text.labelIsValue': '{label} is {value}',
  'text.labelAreValues': '{label} are {values}',
  'text.labelIsRange': '{label} is {min} through {max}',
  'text.rangeThrough': '{min} through {max}',
  'text.sectionLabel': '{section} {label}',
  'text.plotOfType': '{type} plot',
  'text.gridCell': 'Cell [{row},{col}]',

  // Layer navigation (Page Up / Page Down) and the states with nothing to read.
  'text.layerOfSize': 'Layer {index} of {size}: {identity}',
  'text.layerSwitchAt': '{layer} at {details}',
  'text.noAdditionalLayer': 'No additional layer',
  'text.noPlotInfo': 'No plot info to display',
  'text.noFigureInfo': 'No figure info to display',

  // The multi-panel figure lobby: what a subplot is, and how to enter it.
  'text.figureSingleType': 'This is a {type} plot',
  'text.figureMultiType': 'This is a multi-layered plot containing {types} plots',
  'text.subplotOfSize': 'Subplot {index} of {size}',
  'text.subplotOfSizeTitled': 'Subplot {index} of {size}, {title}',
  'text.subplotIndex': 'Subplot {index}',
  'text.figureLobbyDetails': '{position}: {details}. {prompt}',
  'text.pressEnterToSelect': 'Press \'ENTER\' to select this subplot.',

  // Entering a subplot, refusing to enter an empty one, and returning to the
  // lobby. Each combination of an authored title and a known plot type has its
  // own key so no locale has to glue clauses together in English word order.
  'text.enteredSubplot': 'Entered subplot {index} of {size}.',
  'text.enteredSubplotTitled': 'Entered subplot {index} of {size}, {title}.',
  'text.enteredSubplotTyped': 'Entered subplot {index} of {size}, {type} plot.',
  'text.enteredSubplotTitledTyped': 'Entered subplot {index} of {size}, {title}, {type} plot.',
  'text.terseEmptySubplot': '{label}, empty',
  'text.subplotEmpty': 'Subplot {index} of {size} is empty, nothing to describe.',
  'text.subplotEmptyTitled': 'Subplot {index} of {size}, {title} is empty, nothing to describe.',
  'text.figureTerse': 'Figure',
  'text.figureTerseTitled': 'Figure, {title}',
  'text.figureTerseSubplot': 'Figure, subplot {index}',
  'text.returnedToFigure': 'Returned to figure overview.',
  'text.returnedToFigureSubplot': 'Returned to figure overview, subplot {index} of {size}.',
  'text.returnedToFigureSubplotTitled': 'Returned to figure overview, subplot {index} of {size}, {title}.',

  // Box plot outlier sections, which read as a list rather than as one value.
  // The one/many pair is chosen by the caller: English agrees the verb with
  // the count, and no locale needs a plural engine to follow it.
  'text.noOutliersFor': 'no {section} for {label}',
  'text.outliersForOne': '{section} for {label} is {values}',
  'text.outliersForMany': '{section} for {label} are {values}',
  'text.terseNoOutliers': '{value}, no {section}',
  'text.terseOutliers': '{value}, {count} {section} {values}',

  // Facts announced after the point's own value: its share of a stack, and
  // the uncertainty drawn around it.
  'text.shareOfTotal': '{percent}% of it',
  'text.intervalRange': 'interval {min} through {max}',
  'text.intervalFrom': 'interval from {min}',
  'text.intervalUpTo': 'interval up to {max}',

  // Scatter grid cells: the points a cell holds, and entering one that has none.
  'text.noPoints': 'no points',
  'text.pointIsOne': 'point is: {points}',
  'text.pointsAreMany': 'points are: {points}',
  'text.tersePoints': 'points: {points}',
  'text.noPointsInCell': 'No points in this cell',

  // Reaching an edge of the data or of the lobby, in each verbosity.
  'text.noMoreData': 'No more data',
  'text.noMoreDataVerbose': 'No more data to display',
  'text.noMoreSubplots': 'No more subplots',
  'text.noMoreSubplotsVerbose': 'No more subplots to display',

  // Text mode itself.
  'text.textMode': 'Text mode is {mode}',
  'text.modeOff': 'off',
  'text.modeTerse': 'terse',
  'text.modeVerbose': 'verbose',
  'text.textModeOffHint': 'Text mode is off. To enable, press the T key.',

  // A candlestick's trend, which is a word rather than a measurement.
  'text.trendBull': 'bull',
  'text.trendBear': 'bear',
  'text.trendNeutral': 'neutral',

  // Review mode.
  'text.noInfoForReview': 'No info for review',
  'text.reviewMode': 'Review is {mode}',
  'text.reviewOn': 'on',
  'text.reviewOff': 'off',

  // The modifier key as a reader hears it spoken, and the unassigned-key
  // warning that names it. The key names themselves are not translated.
  'text.modifierControl': 'Control',
  'text.modifierCommand': 'Command',
  'text.invalidKey': 'Invalid key. Press {modifier} Slash for keyboard help.',

  // Offering the braille key where braille has nothing to encode.
  'text.brailleUnavailableHere': 'Braille is not available here. Press Enter to select a subplot first.',

  // Label announcements. `text.subplotPrefix` keeps its trailing space: it is
  // prepended to an announcement rather than joined with one.
  'text.subplotPrefix': 'Subplot {index}, ',
  'text.figureAxisLabelIs': 'Figure {axis} label is {label}',
  'text.axisLabelIs': '{axis} label is {label}',
  'text.axisLabelUnavailable': '{axis} label is not available',
  'text.unavailable': 'unavailable',
  'text.figureTitle': 'Figure title',
  'text.subplotTitleIndexed': 'Subplot {index} title',
  'text.subplotTitle': 'Subplot title',
  'text.title': 'Title',
  'text.noTitleAvailable': 'No title available',
  'text.subtitle': 'Subtitle',
  'text.noSubtitleAvailable': 'No subtitle available',
  'text.caption': 'Caption',
  'text.noCaptionAvailable': 'No caption available',

  // Position announcements, one shape per chart family.
  'text.notInChart': 'Not in a chart, unable to show position.',
  'text.indexOfSize': '{index} of {size}',
  'text.positionIs': 'Position is {position} of {total}',
  'text.positionIsColumnRow': 'Position is column {col} of {cols}, row {row} of {rows}',
  'text.positionInSection': 'Position is {position} of {total} in {section}',
  'text.positionOfTotalWith': 'Position is {position} of {total}, {detail}',
  'text.level': 'Level',
  'text.violinOfTotal': 'Violin {index} of {total}',
  'text.seriesOfTotal': '{noun} {index} of {total}',
  'text.seriesNounLine': 'Line',
  'text.seriesNounObservation': 'Observation',
  'text.seriesNounCompetitor': 'Competitor',
  'text.seriesNounSeries': 'Series',
  'text.columnRowPosition': 'Column {col} of {cols}, row {row} of {rows}',
  'text.wholeCircle': 'the whole circle',
  'text.nearlyWholeCircle': 'nearly the whole circle',
  'text.atClockHour': 'at {hour} o\'clock',
  'text.fromClockHourTo': 'from {start} o\'clock to {end} o\'clock',

  // Jumping straight to a layer's extreme value.
  'text.noMinimumValue': 'No minimum value to go to in this layer',
  'text.noMaximumValue': 'No maximum value to go to in this layer',
  'text.pointPosition': '{point}, {position} of {total}',
} as const;
