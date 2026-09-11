import type { MessageKey } from '../index';

export const text = {
  // Reading fragments the per-point announcements are composed from.
  'text.labelIsValue': '{label} {value} है',
  'text.labelAreValues': '{label} {values} हैं',
  'text.labelIsRange': '{label} {min} से {max} तक है',
  'text.rangeThrough': '{min} से {max} तक',
  'text.sectionLabel': '{section} {label}',
  'text.plotOfType': '{type} प्लॉट',
  'text.gridCell': 'सेल {row}, {col}',

  // Layer navigation and the states with nothing to read.
  'text.layerOfSize': '{size} में से लेयर {index}: {identity}',
  'text.layerSwitchAt': '{layer}, {details} पर',
  'text.noAdditionalLayer': 'कोई और लेयर नहीं',
  'text.noPlotInfo': 'दिखाने के लिए कोई प्लॉट जानकारी नहीं',
  'text.noFigureInfo': 'दिखाने के लिए कोई फ़िगर जानकारी नहीं',

  // The multi-panel figure lobby.
  'text.figureSingleType': 'यह एक {type} प्लॉट है',
  'text.figureMultiType': 'यह एक बहु-लेयर प्लॉट है जिसमें {types} प्लॉट हैं',
  'text.subplotOfSize': '{size} में से सबप्लॉट {index}',
  'text.subplotOfSizeTitled': '{size} में से सबप्लॉट {index}, {title}',
  'text.subplotIndex': 'सबप्लॉट {index}',
  'text.figureLobbyDetails': '{position}: {details}। {prompt}',
  'text.pressEnterToSelect': 'इस सबप्लॉट को चुनने के लिए Enter दबाएँ।',

  // Entering, refusing, and leaving a subplot.
  'text.enteredSubplot': '{size} में से सबप्लॉट {index} में प्रवेश किया।',
  'text.enteredSubplotTitled': '{size} में से सबप्लॉट {index}, {title} में प्रवेश किया।',
  'text.enteredSubplotTyped': '{size} में से सबप्लॉट {index}, {type} प्लॉट में प्रवेश किया।',
  'text.enteredSubplotTitledTyped': '{size} में से सबप्लॉट {index}, {title}, {type} प्लॉट में प्रवेश किया।',
  'text.terseEmptySubplot': '{label}, खाली',
  'text.subplotEmpty': '{size} में से सबप्लॉट {index} खाली है, वर्णन के लिए कुछ नहीं।',
  'text.subplotEmptyTitled': '{size} में से सबप्लॉट {index}, {title} खाली है, वर्णन के लिए कुछ नहीं।',
  'text.figureTerse': 'फ़िगर',
  'text.figureTerseTitled': 'फ़िगर, {title}',
  'text.figureTerseSubplot': 'फ़िगर, सबप्लॉट {index}',
  'text.returnedToFigure': 'फ़िगर अवलोकन पर लौटे।',
  'text.returnedToFigureSubplot': 'फ़िगर अवलोकन पर लौटे, {size} में से सबप्लॉट {index}।',
  'text.returnedToFigureSubplotTitled': 'फ़िगर अवलोकन पर लौटे, {size} में से सबप्लॉट {index}, {title}।',

  // Outlier sections. The one/many pair is chosen by the caller.
  'text.noOutliersFor': '{label} के लिए कोई {section} नहीं',
  'text.outliersForOne': '{label} के लिए {section} {values} है',
  'text.outliersForMany': '{label} के लिए {section} {values} हैं',
  'text.terseNoOutliers': '{value}, कोई {section} नहीं',
  'text.terseOutliers': '{value}, {count} {section} {values}',

  // Share of a stack, and the uncertainty around a value.
  'text.shareOfTotal': 'इसका {percent}%',
  'text.intervalRange': 'अंतराल {min} से {max} तक',
  'text.intervalFrom': 'अंतराल {min} से',
  'text.intervalUpTo': 'अंतराल {max} तक',

  // Scatter grid cells.
  'text.noPoints': 'कोई बिंदु नहीं',
  'text.pointIsOne': 'बिंदु है: {points}',
  'text.pointsAreMany': 'बिंदु हैं: {points}',
  'text.tersePoints': 'बिंदु: {points}',
  'text.noPointsInCell': 'इस सेल में कोई बिंदु नहीं',

  // Edges of the data and of the lobby.
  'text.noMoreData': 'और डेटा नहीं',
  'text.noMoreDataVerbose': 'दिखाने के लिए और डेटा नहीं',
  'text.noMoreSubplots': 'और सबप्लॉट नहीं',
  'text.noMoreSubplotsVerbose': 'दिखाने के लिए और सबप्लॉट नहीं',

  // Text mode.
  'text.textMode': 'टेक्स्ट मोड {mode} है',
  'text.modeOff': 'बंद',
  'text.modeTerse': 'संक्षिप्त',
  'text.modeVerbose': 'विस्तृत',
  'text.textModeOffHint': 'टेक्स्ट मोड बंद है। चालू करने के लिए T कुंजी दबाएँ।',

  // A candlestick's trend.
  'text.trendBull': 'तेज़ी',
  'text.trendBear': 'मंदी',
  'text.trendNeutral': 'स्थिर',

  // Review mode.
  'text.noInfoForReview': 'समीक्षा के लिए कोई जानकारी नहीं',
  'text.reviewMode': 'समीक्षा {mode} है',
  'text.reviewOn': 'चालू',
  'text.reviewOff': 'बंद',

  // Key names stay as they are; the words around them are translated.
  'text.modifierControl': 'Control',
  'text.modifierCommand': 'Command',
  'text.invalidKey': 'अमान्य कुंजी। कीबोर्ड सहायता के लिए {modifier} स्लैश दबाएँ।',

  'text.brailleUnavailableHere': 'यहाँ ब्रेल उपलब्ध नहीं है। पहले Enter दबाकर कोई सबप्लॉट चुनें।',

  // Label announcements. The trailing space of `text.subplotPrefix` is part of
  // the message: it is prepended to an announcement rather than joined with one.
  'text.subplotPrefix': 'सबप्लॉट {index}, ',
  'text.figureAxisLabelIs': 'फ़िगर {axis} लेबल {label} है',
  'text.axisLabelIs': '{axis} लेबल {label} है',
  'text.axisLabelUnavailable': '{axis} लेबल उपलब्ध नहीं है',
  'text.unavailable': 'उपलब्ध नहीं',
  'text.figureTitle': 'फ़िगर शीर्षक',
  'text.subplotTitleIndexed': 'सबप्लॉट {index} शीर्षक',
  'text.subplotTitle': 'सबप्लॉट शीर्षक',
  'text.title': 'शीर्षक',
  'text.noTitleAvailable': 'कोई शीर्षक उपलब्ध नहीं',
  'text.subtitle': 'उपशीर्षक',
  'text.noSubtitleAvailable': 'कोई उपशीर्षक उपलब्ध नहीं',
  'text.caption': 'कैप्शन',
  'text.noCaptionAvailable': 'कोई कैप्शन उपलब्ध नहीं',

  // Position announcements.
  'text.notInChart': 'चार्ट में नहीं हैं, स्थिति नहीं बताई जा सकती।',
  'text.indexOfSize': '{size} में से {index}',
  'text.positionIs': 'स्थिति {total} में से {position} है',
  'text.positionIsColumnRow': 'स्थिति {cols} में से कॉलम {col}, {rows} में से पंक्ति {row} है',
  'text.positionInSection': 'स्थिति {section} में {total} में से {position} है',
  'text.positionOfTotalWith': 'स्थिति {total} में से {position} है, {detail}',
  'text.level': 'स्तर',
  'text.violinOfTotal': '{total} में से वायलिन {index}',
  'text.seriesOfTotal': '{total} में से {noun} {index}',
  'text.seriesNounLine': 'लाइन',
  'text.seriesNounObservation': 'प्रेक्षण',
  'text.seriesNounCompetitor': 'प्रतियोगी',
  'text.seriesNounSeries': 'श्रृंखला',
  'text.columnRowPosition': '{cols} में से कॉलम {col}, {rows} में से पंक्ति {row}',
  'text.wholeCircle': 'पूरा वृत्त',
  'text.nearlyWholeCircle': 'लगभग पूरा वृत्त',
  'text.atClockHour': '{hour} बजे की दिशा में',
  'text.fromClockHourTo': '{start} बजे से {end} बजे की दिशा तक',

  // Jumping to a layer's extreme value.
  'text.noMinimumValue': 'इस लेयर में जाने के लिए कोई न्यूनतम मान नहीं',
  'text.noMaximumValue': 'इस लेयर में जाने के लिए कोई अधिकतम मान नहीं',
  'text.pointPosition': '{point}, {total} में से {position}',
} satisfies Partial<Record<MessageKey, string>>;
