import type { MessageKey } from '../index';

export const text = {
  // Reading fragments the per-point announcements are composed from.
  'text.labelIsValue': '{label} 为 {value}',
  'text.labelAreValues': '{label} 为 {values}',
  'text.labelIsRange': '{label} 为 {min} 到 {max}',
  'text.rangeThrough': '{min} 到 {max}',
  'text.sectionLabel': '{section} {label}',
  'text.plotOfType': '{type}图',
  'text.gridCell': '单元格 {row}，{col}',

  // Layer navigation and the states with nothing to read.
  'text.layerOfSize': '第 {index} 个图层，共 {size} 个：{identity}',
  'text.layerSwitchAt': '{layer}，位于 {details}',
  'text.noAdditionalLayer': '没有其他图层',
  'text.noPlotInfo': '没有可显示的图表信息',
  'text.noFigureInfo': '没有可显示的图形信息',

  // The multi-panel figure lobby.
  'text.figureSingleType': '这是一个{type}图',
  'text.figureMultiType': '这是一个多图层图表，包含{types}图',
  'text.subplotOfSize': '第 {index} 个子图，共 {size} 个',
  'text.subplotOfSizeTitled': '第 {index} 个子图，共 {size} 个，{title}',
  'text.subplotIndex': '子图 {index}',
  'text.figureLobbyDetails': '{position}：{details}。{prompt}',
  'text.pressEnterToSelect': '按 Enter 选择此子图。',

  // Entering, refusing, and leaving a subplot.
  'text.enteredSubplot': '已进入第 {index} 个子图，共 {size} 个。',
  'text.enteredSubplotTitled': '已进入第 {index} 个子图，共 {size} 个，{title}。',
  'text.enteredSubplotTyped': '已进入第 {index} 个子图，共 {size} 个，{type}图。',
  'text.enteredSubplotTitledTyped': '已进入第 {index} 个子图，共 {size} 个，{title}，{type}图。',
  'text.terseEmptySubplot': '{label}，空',
  'text.subplotEmpty': '共 {size} 个子图中的第 {index} 个为空，没有可描述的内容。',
  'text.subplotEmptyTitled': '共 {size} 个子图中的第 {index} 个，{title}，为空，没有可描述的内容。',
  'text.figureTerse': '图形',
  'text.figureTerseTitled': '图形，{title}',
  'text.figureTerseSubplot': '图形，子图 {index}',
  'text.returnedToFigure': '已返回图形概览。',
  'text.returnedToFigureSubplot': '已返回图形概览，第 {index} 个子图，共 {size} 个。',
  'text.returnedToFigureSubplotTitled': '已返回图形概览，第 {index} 个子图，共 {size} 个，{title}。',

  // Outlier sections. Chinese does not agree a verb with the count, so the
  // one/many pair English needs renders the same either way.
  'text.noOutliersFor': '{label} 没有{section}',
  'text.outliersForOne': '{label} 的{section}为 {values}',
  'text.outliersForMany': '{label} 的{section}为 {values}',
  'text.terseNoOutliers': '{value}，无{section}',
  'text.terseOutliers': '{value}，{count} 个{section} {values}',

  // Share of a stack, and the uncertainty around a value.
  'text.shareOfTotal': '占 {percent}%',
  'text.intervalRange': '区间 {min} 到 {max}',
  'text.intervalFrom': '区间从 {min} 起',
  'text.intervalUpTo': '区间到 {max} 为止',

  // Scatter grid cells.
  'text.noPoints': '没有点',
  'text.pointIsOne': '点为：{points}',
  'text.pointsAreMany': '点为：{points}',
  'text.tersePoints': '点：{points}',
  'text.noPointsInCell': '此单元格中没有点',

  // Edges of the data and of the lobby.
  'text.noMoreData': '没有更多数据',
  'text.noMoreDataVerbose': '没有更多可显示的数据',
  'text.noMoreSubplots': '没有更多子图',
  'text.noMoreSubplotsVerbose': '没有更多可显示的子图',

  // Text mode.
  'text.textMode': '文本模式：{mode}',
  'text.modeOff': '关闭',
  'text.modeTerse': '简洁',
  'text.modeVerbose': '详细',
  'text.textModeOffHint': '文本模式已关闭。按 T 键可开启。',

  // A candlestick's trend.
  'text.trendBull': '看涨',
  'text.trendBear': '看跌',
  'text.trendNeutral': '中性',

  // Review mode.
  'text.noInfoForReview': '没有可查看的信息',
  'text.reviewMode': '查看模式{mode}',
  'text.reviewOn': '已开启',
  'text.reviewOff': '已关闭',

  // Key names stay as they are; the words around them are translated.
  'text.modifierControl': 'Control',
  'text.modifierCommand': 'Command',
  'text.invalidKey': '无效按键。按 {modifier} 加斜杠键可查看键盘帮助。',

  // Offering the braille key where braille has nothing to encode.
  'text.brailleUnavailableHere': '此处无法使用盲文。请先按 Enter 选择一个子图。',

  // Label announcements. `text.subplotPrefix` is prepended to an announcement
  // rather than joined with one; the full-width comma carries the separation.
  'text.subplotPrefix': '子图 {index}，',
  'text.figureAxisLabelIs': '图形 {axis} 轴标签为 {label}',
  'text.axisLabelIs': '{axis} 轴标签为 {label}',
  'text.axisLabelUnavailable': '{axis} 轴标签不可用',
  'text.unavailable': '不可用',
  'text.figureTitle': '图形标题',
  'text.subplotTitleIndexed': '子图 {index} 标题',
  'text.subplotTitle': '子图标题',
  'text.title': '标题',
  'text.noTitleAvailable': '没有标题',
  'text.subtitle': '副标题',
  'text.noSubtitleAvailable': '没有副标题',
  'text.caption': '说明文字',
  'text.noCaptionAvailable': '没有说明文字',

  // Position announcements.
  'text.notInChart': '不在图表中，无法显示位置。',
  'text.indexOfSize': '第 {index} 个，共 {size} 个',
  'text.positionIs': '位置为第 {position} 个，共 {total} 个',
  'text.positionIsColumnRow': '位置为第 {col} 列，共 {cols} 列，第 {row} 行，共 {rows} 行',
  'text.positionInSection': '位置为{section}中的第 {position} 个，共 {total} 个',
  'text.positionOfTotalWith': '位置为第 {position} 个，共 {total} 个，{detail}',
  'text.level': '级别',
  'text.violinOfTotal': '第 {index} 个小提琴，共 {total} 个',
  'text.seriesOfTotal': '{noun} {index}，共 {total} 个',
  'text.seriesNounLine': '折线',
  'text.seriesNounObservation': '观测',
  'text.seriesNounCompetitor': '竞争者',
  'text.seriesNounSeries': '系列',
  'text.columnRowPosition': '第 {col} 列，共 {cols} 列，第 {row} 行，共 {rows} 行',
  'text.wholeCircle': '整个圆',
  'text.nearlyWholeCircle': '几乎整个圆',
  'text.atClockHour': '{hour} 点钟方向',
  'text.fromClockHourTo': '从 {start} 点钟方向到 {end} 点钟方向',

  // Jumping to a layer's extreme value.
  'text.noMinimumValue': '此图层中没有可跳转的最小值',
  'text.noMaximumValue': '此图层中没有可跳转的最大值',
  'text.pointPosition': '{point}，第 {position} 个，共 {total} 个',
} satisfies Partial<Record<MessageKey, string>>;
