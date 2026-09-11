import type { MessageKey } from '../index';

export const notification = {
  // Autoplay speed.
  'notification.speedUp': '速度を上げました',
  'notification.maxSpeed': '最高速度',
  'notification.speedDown': '速度を下げました',
  'notification.minSpeed': '最低速度',
  'notification.resetSpeed': '速度をリセットしました',

  // Sonification.
  'notification.soundIs': '音声 {mode}',
  'notification.audioModeOff': 'オフ',
  'notification.audioModeOn': 'オン',
  'notification.audioModeCombined': '統合',
  'notification.audioModeSeparate': '分離',

  // Braille.
  'notification.brailleIsOn': '点字 オン',
  'notification.brailleIsOff': '点字 オフ',
  'notification.brailleNoInfo': '点字で表示できる情報がありません',
  'notification.brailleNotSupported': 'グラフの種類 {type} では点字はサポートされていません',
  'notification.brailleDisplay': '点字ディスプレイ',

  // Monitor mode on live charts.
  'notification.monitoringLiveOnly': 'モニタリングはライブチャートでのみ使用できます',
  'notification.monitoringOn': 'モニタリング オン',
  'notification.monitoringOff': 'モニタリング オフ',

  // High contrast.
  'notification.highContrastOn': 'ハイコントラストモード オン',
  'notification.highContrastOff': 'ハイコントラストモード オフ',

  // Candlestick reference comparison (the virtual delta layer).
  'notification.deltaCandlestickOnly': '基準線比較はローソク足チャートでのみ使用できます。',
  'notification.deltaNeedsLineLayer': '基準線比較は折れ線レイヤーのあるローソク足チャートでのみ使用できます。',
  'notification.deltaReferenceUnavailable': '選択した基準線は使用できません。',
  'notification.deltaNoMatchingX': 'ローソク足チャートと{reference}の間に一致するx値がありません。',
  'notification.deltaKeepingComparison': '現在の比較を維持します。{reference}は{x}まで届いていません。この基準線が通るローソク足に移動してから、もう一度選択してください。',
  'notification.deltaNoComparisonAtX': '{x}には基準線比較がありません。{reference}はこのローソク足まで届いていません。移動平均線が通るローソク足に移動してから、Alt L キーを押してください。',
  'notification.deltaActivationFailed': 'ここでは基準線比較を開始できませんでした。',
  'notification.deltaActivated': '基準線比較 オン。OHLC価格から{reference}を引いた値で、ポイント数は{count}、{field}から始まります。正の値は線より上、負の値は線より下を表します。左右の矢印キーでローソク足の間を移動し、上下の矢印キーで始値、高値、安値、終値を切り替えます。Alt L キーで比較をオフにし、G キーで極値へ移動し、ローターで線より上、線より下、線上のポイントを探せます。Escape キーを押すとチャートに戻ります。',
  'notification.deltaClosed': '基準線比較を終了しました。チャートのレイヤーに戻りました。もう一度比較するには Alt L キーを押してください。',
  'notification.deltaClosedByUpdate': 'データの更新により基準線比較を終了しました。',
  'notification.deltaNoReferenceChosen': '基準線はまだ選択されていません。リストから移動平均線を選び、Enter キーを押して比較します。キャンセルするには Escape キーを押してください。',
  'notification.deltaTraceTitle': 'OHLC価格と{reference}の比較',
  'notification.deltaYAxisLabel': '{axis} の差分',

  // The reference-line picker.
  'notification.deltaPickerTitle': '基準線と比較',
  'notification.deltaPickerClose': '基準線の選択画面を閉じる',
  'notification.deltaPickerDescription': '各ローソク足と比較する基準線を選んでください。上下の矢印キーで移動し、Enter キーを押します。選択後は Alt L キーで比較のオンとオフを切り替えられます。',
  'notification.deltaPickerListLabel': '基準線の一覧',
} satisfies Partial<Record<MessageKey, string>>;
