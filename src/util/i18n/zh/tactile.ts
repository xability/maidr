import type { MessageKey } from '../index';

export const tactile = {
  'tactile.viewWholePlot': '整个图表',
  'tactile.viewZoomed': '放大 {zoom} 倍，中心位于横向 {x}%、纵向 {y}%',
  'tactile.viewEmpty': '{view}，视图中没有内容',
  'tactile.viewUnchanged': '{view}，触点没有变化',

  'tactile.noView': '触觉显示器上还没有任何内容',
  'tactile.zoomAtClosest': '已经放大到最大',
  'tactile.zoomAtWholePlot': '已经显示整个图表',
  'tactile.panWholePlot': '已经显示整个图表，请先放大再平移',
  'tactile.panEdgeUp': '上方没有更多内容',
  'tactile.panEdgeDown': '下方没有更多内容',
  'tactile.panEdgeLeft': '左侧没有更多内容',
  'tactile.panEdgeRight': '右侧没有更多内容',
  'tactile.brailleOff': '请先开启盲文再使用触觉显示器',
  'tactile.notConnected': '没有连接触觉显示器',

  'tactile.lineWholeShown': '已经显示整行',
  'tactile.lineStart': '行首',
  'tactile.lineEnd': '行尾',
  'tactile.linePart': '第 {index} 段，共 {total} 段',
  'tactile.lineUncontracted': '缩写盲文不可用，触觉显示器的文本行以非缩写盲文显示',

  'tactile.deviceDisconnected': 'DotPad 已断开连接',
  'tactile.deviceNoBluetooth': '此页面无法通过 Bluetooth 连接 DotPad。Web Bluetooth 需要 Chromium 内核的浏览器，以及获准使用它的页面或 iframe。',
  'tactile.deviceNoUsb': '此页面无法通过 USB 连接 DotPad。Web Serial 需要桌面版 Chromium 内核的浏览器，以及获准使用它的页面或 iframe。',
  'tactile.deviceNoSdk': '此页面上找不到 DotPad SDK。',
  'tactile.deviceNoneSelected': '未选择任何 DotPad。',
  'tactile.deviceConnectFailed': '无法连接到 DotPad。',
  'tactile.deviceNotPermitted': '此页面无权连接 DotPad。页面必须通过 HTTPS 提供，iframe 还需要相应的 allow 属性。',
} satisfies Partial<Record<MessageKey, string>>;
