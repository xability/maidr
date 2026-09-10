import type { MessageKey } from '../index';

export const tactile = {
  'tactile.viewWholePlot': '그래프 전체',
  'tactile.viewZoomed': '{zoom}배 확대, 가로 {x}%, 세로 {y}% 지점 중심',
  'tactile.viewEmpty': '{view}, 보이는 내용이 없습니다',
  'tactile.viewUnchanged': '{view}, 핀이 그대로입니다',

  'tactile.noView': '촉각 디스플레이에 아직 표시된 내용이 없습니다',
  'tactile.zoomAtClosest': '이미 가장 크게 확대되어 있습니다',
  'tactile.zoomAtWholePlot': '이미 그래프 전체를 보여 주고 있습니다',
  'tactile.panWholePlot': '이미 그래프 전체가 보입니다. 이동하려면 확대하세요',
  'tactile.panEdgeUp': '위쪽에 더 보여 줄 내용이 없습니다',
  'tactile.panEdgeDown': '아래쪽에 더 보여 줄 내용이 없습니다',
  'tactile.panEdgeLeft': '왼쪽에 더 보여 줄 내용이 없습니다',
  'tactile.panEdgeRight': '오른쪽에 더 보여 줄 내용이 없습니다',
  'tactile.brailleOff': '촉각 디스플레이를 사용하려면 점자를 켜세요',
  'tactile.notConnected': '연결된 촉각 디스플레이가 없습니다',

  'tactile.lineWholeShown': '이미 줄 전체가 표시되어 있습니다',
  'tactile.lineStart': '줄의 처음입니다',
  'tactile.lineEnd': '줄의 끝입니다',
  'tactile.linePart': '줄 {total}부분 중 {index}번째',
  'tactile.lineUncontracted': '축약 점자를 사용할 수 없어 촉각 디스플레이의 텍스트 줄이 비축약 점자로 표시됩니다',

  'tactile.deviceDisconnected': 'DotPad 연결이 끊겼습니다',
  'tactile.deviceNoBluetooth': '이 페이지에서는 Bluetooth로 DotPad에 연결할 수 없습니다. Web Bluetooth를 사용하려면 Chromium 계열 브라우저와 사용이 허용된 페이지 또는 iframe이 필요합니다.',
  'tactile.deviceNoUsb': '이 페이지에서는 USB로 DotPad에 연결할 수 없습니다. Web Serial을 사용하려면 데스크톱의 Chromium 계열 브라우저와 사용이 허용된 페이지 또는 iframe이 필요합니다.',
  'tactile.deviceNoSdk': '이 페이지에서 DotPad SDK를 찾을 수 없습니다.',
  'tactile.deviceNoneSelected': 'DotPad를 선택하지 않았습니다.',
  'tactile.deviceConnectFailed': 'DotPad에 연결하지 못했습니다.',
  'tactile.deviceNotPermitted': '이 페이지는 DotPad에 연결할 권한이 없습니다. HTTPS로 제공되어야 하며, iframe이라면 알맞은 allow 속성이 필요합니다.',
} satisfies Partial<Record<MessageKey, string>>;
