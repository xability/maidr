import type { MessageKey } from '../index';

export const text = {
  // Reading fragments. The label is data the producer chose, so the particle
  // after it is attached at render time rather than written into the template.
  'text.labelIsValue': '{label|은는} {value}',
  'text.labelAreValues': '{label|은는} {values}',
  'text.labelIsRange': '{label|은는} {min}부터 {max}까지',
  'text.rangeThrough': '{min}부터 {max}까지',
  'text.sectionLabel': '{section} {label}',
  'text.plotOfType': '{type} 그래프',
  'text.gridCell': '셀 {row}행 {col}열',

  // Layer navigation and the states with nothing to read.
  'text.layerOfSize': '레이어 {size}개 중 {index}: {identity}',
  'text.layerSwitchAt': '{layer}, {details}',
  'text.noAdditionalLayer': '추가 레이어가 없습니다',
  'text.noPlotInfo': '표시할 그래프 정보가 없습니다',
  'text.noFigureInfo': '표시할 그림 정보가 없습니다',

  // The multi-panel figure lobby.
  'text.figureSingleType': '{type} 그래프입니다',
  'text.figureMultiType': '{types} 그래프를 포함한 다중 레이어 그래프입니다',
  'text.subplotOfSize': '서브플롯 {size}개 중 {index}',
  'text.subplotOfSizeTitled': '서브플롯 {size}개 중 {index}, {title}',
  'text.subplotIndex': '서브플롯 {index}',
  'text.figureLobbyDetails': '{position}: {details}. {prompt}',
  'text.pressEnterToSelect': '이 서브플롯을 선택하려면 Enter 키를 누르세요.',

  // Entering, refusing, and leaving a subplot.
  'text.enteredSubplot': '서브플롯 {size}개 중 {index}에 진입했습니다.',
  'text.enteredSubplotTitled': '서브플롯 {size}개 중 {index}, {title}에 진입했습니다.',
  'text.enteredSubplotTyped': '서브플롯 {size}개 중 {index}, {type} 그래프에 진입했습니다.',
  'text.enteredSubplotTitledTyped': '서브플롯 {size}개 중 {index}, {title}, {type} 그래프에 진입했습니다.',
  'text.terseEmptySubplot': '{label}, 비어 있음',
  'text.subplotEmpty': '서브플롯 {size}개 중 {index|은는} 비어 있어 설명할 내용이 없습니다.',
  'text.subplotEmptyTitled': '서브플롯 {size}개 중 {index}, {title|은는} 비어 있어 설명할 내용이 없습니다.',
  'text.figureTerse': '그림',
  'text.figureTerseTitled': '그림, {title}',
  'text.figureTerseSubplot': '그림, 서브플롯 {index}',
  'text.returnedToFigure': '그림 개요로 돌아왔습니다.',
  'text.returnedToFigureSubplot': '그림 개요, 서브플롯 {size}개 중 {index|으로} 돌아왔습니다.',
  'text.returnedToFigureSubplotTitled': '그림 개요, 서브플롯 {size}개 중 {index}, {title|으로} 돌아왔습니다.',

  // Outlier sections. Korean does not agree a verb with the count, so the
  // one/many pair English needs renders the same either way.
  'text.noOutliersFor': '{label}의 {section} 없음',
  'text.outliersForOne': '{label}의 {section} {values}',
  'text.outliersForMany': '{label}의 {section} {values}',
  'text.terseNoOutliers': '{value}, {section} 없음',
  'text.terseOutliers': '{value}, {section} {count}개 {values}',

  // Share of a stack, and the uncertainty around a value.
  'text.shareOfTotal': '그중 {percent}%',
  'text.intervalRange': '구간 {min}부터 {max}까지',
  'text.intervalFrom': '구간 {min}부터',
  'text.intervalUpTo': '구간 {max}까지',

  // Scatter grid cells.
  'text.noPoints': '점 없음',
  'text.pointIsOne': '점 {points}',
  'text.pointsAreMany': '점 {points}',
  'text.tersePoints': '점 {points}',
  'text.noPointsInCell': '이 셀에는 점이 없습니다',

  // Edges of the data and of the lobby.
  'text.noMoreData': '데이터 끝',
  'text.noMoreDataVerbose': '표시할 데이터가 더 없습니다',
  'text.noMoreSubplots': '서브플롯 끝',
  'text.noMoreSubplotsVerbose': '표시할 서브플롯이 더 없습니다',

  // Text mode.
  'text.textMode': '텍스트 모드: {mode}',
  'text.modeOff': '끔',
  'text.modeTerse': '간략',
  'text.modeVerbose': '상세',
  'text.textModeOffHint': '텍스트 모드가 꺼져 있습니다. 켜려면 T 키를 누르세요.',

  // A candlestick's trend.
  'text.trendBull': '상승',
  'text.trendBear': '하락',
  'text.trendNeutral': '보합',

  // Review mode.
  'text.noInfoForReview': '검토할 정보가 없습니다',
  'text.reviewMode': '검토 모드: {mode}',
  'text.reviewOn': '켬',
  'text.reviewOff': '끔',

  // Key names stay as they are; the words around them are translated.
  'text.modifierControl': 'Control',
  'text.modifierCommand': 'Command',
  'text.invalidKey': '잘못된 키입니다. 키보드 도움말을 보려면 {modifier} 슬래시를 누르세요.',

  'text.brailleUnavailableHere': '여기서는 점자를 사용할 수 없습니다. 먼저 Enter 키를 눌러 서브플롯을 선택하세요.',

  // Label announcements. The trailing space of `text.subplotPrefix` is part of
  // the message: it is prepended to an announcement rather than joined with one.
  'text.subplotPrefix': '서브플롯 {index}, ',
  'text.figureAxisLabelIs': '그림 {axis}축 이름은 {label}',
  'text.axisLabelIs': '{axis}축 이름은 {label}',
  'text.axisLabelUnavailable': '{axis}축 이름을 사용할 수 없습니다',
  'text.unavailable': '사용할 수 없음',
  'text.figureTitle': '그림 제목',
  'text.subplotTitleIndexed': '서브플롯 {index} 제목',
  'text.subplotTitle': '서브플롯 제목',
  'text.title': '제목',
  'text.noTitleAvailable': '제목이 없습니다',
  'text.subtitle': '부제목',
  'text.noSubtitleAvailable': '부제목이 없습니다',
  'text.caption': '자막',
  'text.noCaptionAvailable': '자막이 없습니다',

  // Position announcements.
  'text.notInChart': '그래프 안이 아니어서 위치를 표시할 수 없습니다.',
  'text.indexOfSize': '{size}개 중 {index}',
  'text.positionIs': '위치 {total}개 중 {position}',
  'text.positionIsColumnRow': '위치 열 {cols}개 중 {col}, 행 {rows}개 중 {row}',
  'text.positionInSection': '위치 {total}개 중 {position}, {section}',
  'text.positionOfTotalWith': '위치 {total}개 중 {position}, {detail}',
  'text.level': '수준',
  'text.violinOfTotal': '바이올린 {total}개 중 {index}',
  'text.seriesOfTotal': '{noun} {total}개 중 {index}',
  'text.seriesNounLine': '선',
  'text.seriesNounObservation': '관측값',
  'text.seriesNounCompetitor': '경쟁자',
  'text.seriesNounSeries': '계열',
  'text.columnRowPosition': '열 {cols}개 중 {col}, 행 {rows}개 중 {row}',
  'text.wholeCircle': '원 전체',
  'text.nearlyWholeCircle': '원 거의 전체',
  'text.atClockHour': '{hour}시 방향',
  'text.fromClockHourTo': '{start}시부터 {end}시 방향까지',

  // Jumping to a layer's extreme value.
  'text.noMinimumValue': '이 레이어에는 이동할 최솟값이 없습니다',
  'text.noMaximumValue': '이 레이어에는 이동할 최댓값이 없습니다',
  'text.pointPosition': '{point}, {total}개 중 {position}',
} satisfies Partial<Record<MessageKey, string>>;
