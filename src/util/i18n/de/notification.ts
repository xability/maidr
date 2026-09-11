import type { MessageKey } from '../index';

export const notification = {
  // Autoplay speed.
  'notification.speedUp': '속도 높임',
  'notification.maxSpeed': '최고 속도',
  'notification.speedDown': '속도 낮춤',
  'notification.minSpeed': '최저 속도',
  'notification.resetSpeed': '속도 초기화',

  // Sonification.
  'notification.soundIs': '소리 {mode}',
  'notification.audioModeOff': '꺼짐',
  'notification.audioModeOn': '켜짐',
  'notification.audioModeCombined': '통합',
  'notification.audioModeSeparate': '분리',

  // Braille.
  'notification.brailleIsOn': '점자 켜짐',
  'notification.brailleIsOff': '점자 꺼짐',
  'notification.brailleNoInfo': '점자로 나타낼 정보가 없습니다',
  'notification.brailleNotSupported': '{type} 그래프 유형은 점자를 지원하지 않습니다',
  'notification.brailleDisplay': '점자 디스플레이',

  // Monitor mode on live charts.
  'notification.monitoringLiveOnly': '모니터링은 실시간 차트에서만 사용할 수 있습니다',
  'notification.monitoringOn': '모니터링 켜짐',
  'notification.monitoringOff': '모니터링 꺼짐',

  // High contrast.
  'notification.highContrastOn': '고대비 모드 켜짐',
  'notification.highContrastOff': '고대비 모드 꺼짐',

  // Candlestick reference comparison (the virtual delta layer).
  'notification.deltaCandlestickOnly': '기준선 비교는 촛대 차트에서만 사용할 수 있습니다.',
  'notification.deltaNeedsLineLayer': '기준선 비교는 선 레이어가 있는 촛대 차트에서만 사용할 수 있습니다.',
  'notification.deltaReferenceUnavailable': '선택한 기준선을 사용할 수 없습니다.',
  'notification.deltaNoMatchingX': '촛대 차트와 {reference} 사이에 일치하는 x 값이 없습니다.',
  'notification.deltaKeepingComparison': '현재 비교를 유지합니다. {reference|은는} {x}까지 이어지지 않습니다. 해당 기준선이 지나는 캔들로 이동한 뒤 다시 선택하세요.',
  'notification.deltaNoComparisonAtX': '{x}에는 기준선 비교가 없습니다. {reference|은는} 이 캔들까지 이어지지 않습니다. 이동평균선이 지나는 캔들로 이동한 뒤 Alt L 키를 누르세요.',
  'notification.deltaActivationFailed': '여기에서는 기준선 비교를 시작할 수 없습니다.',
  'notification.deltaActivated': '기준선 비교 켜짐. OHLC 가격에서 {reference|을를} 뺀 값이며 데이터 점은 {count}개, {field}에서 시작합니다. 양수는 선 위, 음수는 선 아래를 뜻합니다. 왼쪽과 오른쪽 화살표로 캔들 사이를 이동하고, 위와 아래 화살표로 시가, 고가, 저가, 종가를 전환하세요. Alt L 키로 비교를 끄고, G 키로 극값을 찾고, 로터로 선 위, 선 아래, 선과 일치하는 점을 살펴볼 수 있습니다. Escape 키를 누르면 차트로 돌아갑니다.',
  'notification.deltaClosed': '기준선 비교를 끝내고 차트 레이어로 돌아왔습니다. 다시 비교하려면 Alt L 키를 누르세요.',
  'notification.deltaClosedByUpdate': '데이터 업데이트로 기준선 비교가 종료되었습니다.',
  'notification.deltaNoReferenceChosen': '아직 선택한 기준선이 없습니다. 목록에서 이동평균선을 고르고 Enter 키를 눌러 비교하세요. 취소하려면 Escape 키를 누르세요.',
  'notification.deltaTraceTitle': 'OHLC 가격 대 {reference}',
  'notification.deltaYAxisLabel': '{axis} 편차',

  // The reference-line picker.
  'notification.deltaPickerTitle': '기준선과 비교',
  'notification.deltaPickerClose': '기준선 선택 창 닫기',
  'notification.deltaPickerDescription': '각 캔들과 비교할 기준선을 고르세요. 위와 아래 화살표로 이동한 뒤 Enter 키를 누르세요. 선택한 뒤에는 Alt L 키로 비교를 켜고 끌 수 있습니다.',
  'notification.deltaPickerListLabel': '기준선 목록',
} satisfies Partial<Record<MessageKey, string>>;
