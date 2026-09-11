import type { MessageKey } from '../index';

export const text = {
  // Reading fragments the per-point announcements are composed from.
  'text.labelIsValue': '{label}は{value}',
  'text.labelAreValues': '{label}は{values}',
  'text.labelIsRange': '{label}は{min}から{max}まで',
  'text.rangeThrough': '{min}から{max}まで',
  'text.sectionLabel': '{section} {label}',
  'text.plotOfType': '{type}',
  'text.gridCell': 'セル [{row},{col}]',

  // Layer navigation and the states with nothing to read.
  'text.layerOfSize': 'レイヤー {size}個中{index}番目: {identity}',
  'text.layerSwitchAt': '{layer}、{details}',
  'text.noAdditionalLayer': '他のレイヤーはありません',
  'text.noPlotInfo': '表示するグラフの情報がありません',
  'text.noFigureInfo': '表示する図の情報がありません',

  // The multi-panel figure lobby.
  'text.figureSingleType': 'これは{type}です',
  'text.figureMultiType': 'これは{types}を含む複数レイヤーのグラフです',
  'text.subplotOfSize': 'サブプロット {size}個中{index}番目',
  'text.subplotOfSizeTitled': 'サブプロット {size}個中{index}番目、{title}',
  'text.subplotIndex': 'サブプロット {index}',
  'text.figureLobbyDetails': '{position}: {details}。{prompt}',
  'text.pressEnterToSelect': 'このサブプロットを選択するには Enter キーを押してください。',

  // Entering, refusing, and leaving a subplot.
  'text.enteredSubplot': 'サブプロット {size}個中{index}番目に入りました。',
  'text.enteredSubplotTitled': 'サブプロット {size}個中{index}番目、{title}に入りました。',
  'text.enteredSubplotTyped': 'サブプロット {size}個中{index}番目、{type}に入りました。',
  'text.enteredSubplotTitledTyped': 'サブプロット {size}個中{index}番目、{title}、{type}に入りました。',
  'text.terseEmptySubplot': '{label}、空',
  'text.subplotEmpty': 'サブプロット {size}個中{index}番目は空のため、説明する内容がありません。',
  'text.subplotEmptyTitled': 'サブプロット {size}個中{index}番目、{title}は空のため、説明する内容がありません。',
  'text.figureTerse': '図',
  'text.figureTerseTitled': '図、{title}',
  'text.figureTerseSubplot': '図、サブプロット {index}',
  'text.returnedToFigure': '図の概要に戻りました。',
  'text.returnedToFigureSubplot': '図の概要、サブプロット {size}個中{index}番目に戻りました。',
  'text.returnedToFigureSubplotTitled': '図の概要、サブプロット {size}個中{index}番目、{title}に戻りました。',

  // Outlier sections. Japanese does not agree a verb with the count, so the
  // one/many pair English needs renders the same either way.
  'text.noOutliersFor': '{label}の{section}はありません',
  'text.outliersForOne': '{label}の{section}は{values}',
  'text.outliersForMany': '{label}の{section}は{values}',
  'text.terseNoOutliers': '{value}、{section}なし',
  'text.terseOutliers': '{value}、{section} {count}個 {values}',

  // Share of a stack, and the uncertainty around a value.
  'text.shareOfTotal': '全体の{percent}%',
  'text.intervalRange': '区間 {min}から{max}まで',
  'text.intervalFrom': '区間 {min}から',
  'text.intervalUpTo': '区間 {max}まで',

  // Scatter grid cells.
  'text.noPoints': 'ポイントなし',
  'text.pointIsOne': 'ポイント: {points}',
  'text.pointsAreMany': 'ポイント: {points}',
  'text.tersePoints': 'ポイント: {points}',
  'text.noPointsInCell': 'このセルにポイントはありません',

  // Edges of the data and of the lobby.
  'text.noMoreData': 'データの端です',
  'text.noMoreDataVerbose': 'これ以上表示するデータはありません',
  'text.noMoreSubplots': 'サブプロットの端です',
  'text.noMoreSubplotsVerbose': 'これ以上表示するサブプロットはありません',

  // Text mode.
  'text.textMode': 'テキストモード {mode}',
  'text.modeOff': 'オフ',
  'text.modeTerse': '簡潔',
  'text.modeVerbose': '詳細',
  'text.textModeOffHint': 'テキストモードはオフです。オンにするには T キーを押してください。',

  // A candlestick's trend.
  'text.trendBull': '上昇',
  'text.trendBear': '下落',
  'text.trendNeutral': '横ばい',

  // Review mode.
  'text.noInfoForReview': 'レビューする情報がありません',
  'text.reviewMode': 'レビューモード {mode}',
  'text.reviewOn': 'オン',
  'text.reviewOff': 'オフ',

  // Key names stay as they are; the words around them are translated.
  'text.modifierControl': 'Control',
  'text.modifierCommand': 'Command',
  'text.invalidKey': '無効なキーです。キーボードのヘルプを表示するには {modifier} スラッシュを押してください。',

  'text.brailleUnavailableHere': 'ここでは点字を使用できません。まず Enter キーを押してサブプロットを選択してください。',

  // Label announcements. The trailing space of `text.subplotPrefix` is part of
  // the message: it is prepended to an announcement rather than joined with one.
  'text.subplotPrefix': 'サブプロット {index}、 ',
  'text.figureAxisLabelIs': '図の{axis}軸ラベルは{label}',
  'text.axisLabelIs': '{axis}軸ラベルは{label}',
  'text.axisLabelUnavailable': '{axis}軸ラベルはありません',
  'text.unavailable': 'なし',
  'text.figureTitle': '図のタイトル',
  'text.subplotTitleIndexed': 'サブプロット {index} のタイトル',
  'text.subplotTitle': 'サブプロットのタイトル',
  'text.title': 'タイトル',
  'text.noTitleAvailable': 'タイトルはありません',
  'text.subtitle': 'サブタイトル',
  'text.noSubtitleAvailable': 'サブタイトルはありません',
  'text.caption': 'キャプション',
  'text.noCaptionAvailable': 'キャプションはありません',

  // Position announcements.
  'text.notInChart': 'チャートの中ではないため、位置を表示できません。',
  'text.indexOfSize': '{size}個中{index}番目',
  'text.positionIs': '位置は{total}個中{position}番目',
  'text.positionIsColumnRow': '位置は{cols}列中{col}列目、{rows}行中{row}行目',
  'text.positionInSection': '位置は{section}の{total}個中{position}番目',
  'text.positionOfTotalWith': '位置は{total}個中{position}番目、{detail}',
  'text.level': 'レベル',
  'text.violinOfTotal': 'バイオリン {total}個中{index}番目',
  'text.seriesOfTotal': '{noun} {total}個中{index}番目',
  'text.seriesNounLine': '線',
  'text.seriesNounObservation': '観測値',
  'text.seriesNounCompetitor': '対象',
  'text.seriesNounSeries': '系列',
  'text.columnRowPosition': '{cols}列中{col}列目、{rows}行中{row}行目',
  'text.wholeCircle': '円全体',
  'text.nearlyWholeCircle': 'ほぼ円全体',
  'text.atClockHour': '{hour}時の方向',
  'text.fromClockHourTo': '{start}時の方向から{end}時の方向まで',

  // Jumping to a layer's extreme value.
  'text.noMinimumValue': 'このレイヤーには移動できる最小値がありません',
  'text.noMaximumValue': 'このレイヤーには移動できる最大値がありません',
  'text.pointPosition': '{point}、{total}個中{position}番目',
} satisfies Partial<Record<MessageKey, string>>;
