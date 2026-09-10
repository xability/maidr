import type { MessageKey } from '../index';

export const description = {
  'description.statOrientation': '방향',
  'description.statSubtitle': '부제목',
  'description.statCaption': '캡션',
  'description.statCurrentlyOn': '현재 위치',
  'description.statChartTypes': '차트 종류',
  'description.multiPanelFigure': '다중 패널 그림',
  'description.valueInfinity': '무한대',
  'description.valueNegativeInfinity': '음의 무한대',
  'description.subplotPosition': '서브플롯 {total}개 중 {index}번째',
  'description.chartTypeCount': '{kind} ({count})',

  'description.title': '차트 설명',
  'description.close': '닫기',
  'description.chartTypePrefix': '차트 유형: ',
  'description.titleLabel': '제목',
  'description.titleLabelSubplot': '서브플롯 제목',
  'description.titleLabelFigure': '그림 제목',
  'description.axesHeading': '축',
  'description.axisEntry': '{axis}축: {label}',
  'description.summaryHeading': '요약',
  'description.subplotsHeading': '서브플롯 ({count})',
  'description.subplotUnknown': '알 수 없음',
  'description.subplotCurrent': ' (현재)',

  'description.layersHeading': '레이어 ({count})',
  'description.showingLayer': '레이어 {total}개 중 {index}번째 표시',
  'description.layerHint': '왼쪽과 오른쪽 화살표 키로 레이어 사이를 이동하고 Space 키로 레이어를 엽니다.',
  'description.layerUpdated': '레이어 {total}개 중 {index}번째 설명으로 바뀌었습니다',

  'description.rowOne': '행',
  'description.rowMany': '행',
  'description.tableCaption': '데이터: {total}{rows}',
  'description.tableCaptionTruncated': '데이터: 총 {total}{rows} 중 {shown}{rows} 표시',
  'description.tableShowMore': '총 {total}{rows} 중 {count}{rows} 더 보기',
  'description.tableColumn': '{index}번째 열',
} satisfies Partial<Record<MessageKey, string>>;
