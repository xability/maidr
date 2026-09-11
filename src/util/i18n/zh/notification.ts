import type { MessageKey } from '../index';

export const notification = {
  // Autoplay speed.
  'notification.speedUp': '加速',
  'notification.maxSpeed': '最快速度',
  'notification.speedDown': '减速',
  'notification.minSpeed': '最慢速度',
  'notification.resetSpeed': '重置速度',

  // Sonification.
  'notification.soundIs': '声音{mode}',
  'notification.audioModeOff': '已关闭',
  'notification.audioModeOn': '已开启',
  'notification.audioModeCombined': '已合并',
  'notification.audioModeSeparate': '已分离',

  // Braille.
  'notification.brailleIsOn': '盲文已开启',
  'notification.brailleIsOff': '盲文已关闭',
  'notification.brailleNoInfo': '没有可用于盲文的信息',
  'notification.brailleNotSupported': '图表类型 {type} 不支持盲文',
  'notification.brailleDisplay': '盲文显示器',

  // Monitor mode on live charts.
  'notification.monitoringLiveOnly': '监视功能仅适用于实时图表',
  'notification.monitoringOn': '监视已开启',
  'notification.monitoringOff': '监视已关闭',

  // High contrast.
  'notification.highContrastOn': '高对比度模式已开启',
  'notification.highContrastOff': '高对比度模式已关闭',

  // Candlestick reference comparison (the virtual delta layer).
  'notification.deltaCandlestickOnly': '参考线比较仅适用于 K 线图。',
  'notification.deltaNeedsLineLayer': '参考线比较仅适用于带有折线图层的 K 线图。',
  'notification.deltaReferenceUnavailable': '所选参考线不可用。',
  'notification.deltaNoMatchingX': 'K 线图与 {reference} 之间没有匹配的 x 值。',
  'notification.deltaKeepingComparison': '保持当前比较：{reference} 未覆盖 {x}。请移动到它覆盖的 K 线，然后再次选择。',
  'notification.deltaNoComparisonAtX': '在 {x} 处没有参考线比较：{reference} 未覆盖这根 K 线。请移动到移动平均线覆盖的 K 线，然后按 Alt L。',
  'notification.deltaActivationFailed': '此处无法启用参考线比较。',
  'notification.deltaActivated': '参考线比较已开启：OHLC 价格减去 {reference}，共 {count} 个点，从{field}开始。正值表示在参考线上方，负值表示在下方。使用左右方向键在 K 线之间移动，使用上下方向键在开盘价、最高价、最低价和收盘价之间切换。按 Alt L 关闭比较，按 G 查看极值，使用转子浏览线上方、线下方或线上的点。按 Escape 返回图表。',
  'notification.deltaClosed': '参考线比较已关闭，已返回图表图层。按 Alt L 可再次比较。',
  'notification.deltaClosedByUpdate': '数据更新导致参考线比较已关闭。',
  'notification.deltaNoReferenceChosen': '尚未选择参考线。请在列表中选择一条移动平均线，然后按 Enter 进行比较。按 Escape 取消。',
  'notification.deltaTraceTitle': 'OHLC 价格与 {reference} 之差',
  'notification.deltaYAxisLabel': '{axis} 差值',

  // The reference-line picker.
  'notification.deltaPickerTitle': '与参考线比较',
  'notification.deltaPickerClose': '关闭参考线选择器',
  'notification.deltaPickerDescription': '选择一条参考线，用于与每根 K 线进行比较。使用上下方向键移动，然后按 Enter。选定后，按 Alt L 即可开启或关闭比较。',
  'notification.deltaPickerListLabel': '参考线',
} satisfies Partial<Record<MessageKey, string>>;
