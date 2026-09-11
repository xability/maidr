import type { MessageKey } from '../index';

export const tactile = {
  'tactile.viewWholePlot': 'グラフ全体',
  'tactile.viewZoomed': 'ズーム {zoom}倍、横 {x}%、縦 {y}% の位置が中心',
  'tactile.viewEmpty': '{view}、表示されている内容はありません',
  'tactile.viewUnchanged': '{view}、ピンは変わっていません',

  'tactile.noView': '触覚ディスプレイにはまだ何も表示されていません',
  'tactile.zoomAtClosest': 'すでに最大まで拡大しています',
  'tactile.zoomAtWholePlot': 'すでにグラフ全体を表示しています',
  'tactile.panWholePlot': 'すでにグラフ全体が表示されています。移動するには拡大してください',
  'tactile.panEdgeUp': 'これより上に表示する内容はありません',
  'tactile.panEdgeDown': 'これより下に表示する内容はありません',
  'tactile.panEdgeLeft': 'これより左に表示する内容はありません',
  'tactile.panEdgeRight': 'これより右に表示する内容はありません',
  'tactile.brailleOff': '触覚ディスプレイを使用するには点字をオンにしてください',
  'tactile.notConnected': '触覚ディスプレイが接続されていません',

  'tactile.lineWholeShown': 'すでに行全体が表示されています',
  'tactile.lineStart': '行の先頭です',
  'tactile.lineEnd': '行の末尾です',
  'tactile.linePart': '行の{total}分割中{index}番目',
  'tactile.lineUncontracted': '縮約点字が使用できないため、触覚ディスプレイのテキスト行は非縮約点字で表示されます',

  'tactile.deviceDisconnected': 'DotPad の接続が切れました',
  'tactile.deviceNoBluetooth': 'このページからは Bluetooth で DotPad に接続できません。Web Bluetooth を使用するには、Chromium 系のブラウザーと、使用を許可されたページまたは iframe が必要です。',
  'tactile.deviceNoUsb': 'このページからは USB で DotPad に接続できません。Web Serial を使用するには、デスクトップの Chromium 系ブラウザーと、使用を許可されたページまたは iframe が必要です。',
  'tactile.deviceNoSdk': 'このページに DotPad SDK が見つかりませんでした。',
  'tactile.deviceNoneSelected': 'DotPad が選択されませんでした。',
  'tactile.deviceConnectFailed': 'DotPad に接続できませんでした。',
  'tactile.deviceNotPermitted': 'このページには DotPad に接続する権限がありません。HTTPS で配信されている必要があり、iframe の場合は対応する allow 属性が必要です。',
} satisfies Partial<Record<MessageKey, string>>;
