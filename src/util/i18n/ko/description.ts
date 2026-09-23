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

  // Chart type guide.
  'guide.toggle': '이 차트 종류 알아보기 ({chartType})',
  'guide.definitionHeading': '무엇인가요',
  'guide.purposeHeading': '어디에 쓰나요',
  'guide.appearanceHeading': '어떻게 생겼나요',

  // Multi-panel figure.
  'guide.figure.definition': '다중 패널 그림은 작은 차트 여러 개를 나란히 또는 바둑판처럼 배치한 그림입니다. 전체 제목은 하나를 함께 씁니다.',
  'guide.figure.purpose': '서로 관련된 데이터를 한눈에 비교할 때 씁니다. 예를 들어 같은 값을 집단별로, 또는 연도별로 나눠 봅니다.',
  'guide.figure.appearance': '창살로 나뉜 창문처럼 한 페이지가 여러 칸으로 나뉘어 있다고 생각해 보세요. 칸마다 자기 축을 가진 차트가 하나씩 들어 있고, 한 번에 한 패널씩 들어가 살펴볼 수 있습니다.',

  'guide.area.definition': '영역 그래프는 꺾은선 아래, 선과 바닥 축 사이를 색으로 채운 그래프입니다.',
  'guide.area.purpose': '어떤 양이 시간에 따라 늘고 주는 모습을 보여 줄 때 씁니다. 그 양이 전체적으로 얼마나 큰지도 쉽게 느낄 수 있습니다.',
  'guide.area.appearance': '선 하나가 왼쪽에서 오른쪽으로 이어지며 값에 따라 오르내립니다. 선 아래부터 바닥까지는 모두 채워져 있어서, 옆에서 본 산줄기처럼 보입니다.',

  'guide.alluvial.definition': '충적 다이어그램은 여러 단계를 거치며 항목들이 어느 집단에서 어느 집단으로 옮겨 가는지 보여 줍니다.',
  'guide.alluvial.purpose': '집단 구성의 변화를 따라갈 때 씁니다. 예를 들어 지난 선거와 이번 선거 사이에 유권자가 어느 정당으로 옮겨 갔는지 봅니다.',
  'guide.alluvial.appearance': '블록을 쌓은 기둥들이 왼쪽에서 오른쪽으로 한 줄로 서 있습니다. 기둥 하나가 한 단계입니다. 이웃한 기둥 사이로 굽은 띠가 흐르고, 띠가 두꺼울수록 그 길로 간 항목이 많습니다.',

  'guide.bar.definition': '막대 그래프는 항목마다 숫자 하나를 막대 하나로 보여 줍니다.',
  'guide.bar.purpose': '항목끼리 양을 비교할 때 씁니다. 예를 들어 달별 매출이나 후보별 득표수를 비교합니다.',
  'guide.bar.appearance': '너비가 같은 직사각형들이 같은 기준선에서 시작해 나란히 서 있습니다. 막대가 길수록 값이 큽니다. 막대는 세로로 서 있을 수도, 가로로 누워 있을 수도 있습니다.',

  'guide.bump.definition': '범프 차트는 여러 경쟁자의 순위가 시간에 따라 어떻게 바뀌는지 보여 줍니다.',
  'guide.bump.purpose': '누가 1등, 2등, 3등인지 따라가고, 누가 누구를 앞지르는지 찾을 때 씁니다. 예를 들어 프로 야구 순위표의 변화를 봅니다.',
  'guide.bump.appearance': '시간은 왼쪽에서 오른쪽으로, 순위는 위에서 아래로 흐릅니다. 1등이 맨 위입니다. 경쟁자마다 선이 하나씩 있고, 시점마다 점이 찍혀 있습니다. 순위가 뒤바뀌는 곳에서 선이 서로 엇갈립니다.',

  'guide.box.definition': '상자 그림은 숫자 묶음을 다섯 개의 값으로 요약합니다. 가장 작은 값, 아래쪽 4분의 1 지점, 가운데 값, 위쪽 4분의 1 지점, 가장 큰 값입니다.',
  'guide.box.purpose': '여러 집단의 퍼진 정도와 중심을 비교할 때 씁니다. 이상값이라고 부르는 유난히 튀는 값을 찾을 때도 씁니다.',
  'guide.box.appearance': '집단마다 상자가 하나 있고, 가운데 값 위치에 상자를 가로지르는 선이 있습니다. 상자 양 끝에서 수염이라고 부르는 가는 선이 뻗어 나가 보통 범위의 가장 작은 값과 가장 큰 값에 닿습니다. 이상값은 수염 바깥의 작은 점으로 표시됩니다.',

  'guide.boxen.definition': '문자값 플롯은 상자 그림을 넓힌 것으로, 데이터를 나누는 지점을 더 많이 보여 줍니다. 특히 양 끝부분을 자세히 보여 줍니다.',
  'guide.boxen.purpose': '데이터가 아주 많을 때 씁니다. 보통 상자 그림으로는 극단적인 값에 대한 정보가 너무 많이 가려지기 때문입니다.',
  'guide.boxen.appearance': '집단마다 가운데 값을 중심으로 상자 여러 개가 겹겹이 쌓여 있습니다. 가장 넓은 상자에 데이터의 가운데 절반이 들어 있습니다. 바깥으로 갈수록 상자가 작아지며 양 끝의 더 얇은 부분을 담습니다. 전체 모양은 계단식 피라미드 같습니다.',

  'guide.candlestick.definition': '촛대 차트는 하루 같은 기간마다 가격이 어떻게 움직였는지 보여 줍니다.',
  'guide.candlestick.purpose': '금융에서 주식이나 환율의 기간별 시가, 고가, 저가, 종가를 읽을 때 씁니다.',
  'guide.candlestick.appearance': '시간은 왼쪽에서 오른쪽으로 흐르고, 기간마다 초가 하나씩 있습니다. 초마다 시가와 종가 사이를 잇는 굵은 몸통이 있습니다. 몸통 위아래로는 심지라고 부르는 가는 선이 고가와 저가까지 뻗어 있습니다. 보통 가격이 오른 날과 내린 날의 몸통 색이 다릅니다.',

  'guide.candlestick_delta.definition': '촛대 기준선 편차는 촛대 차트의 초 하나하나를 이동 평균 같은 기준선과 비교합니다.',
  'guide.candlestick_delta.purpose': '기간마다 가격이 평소 수준보다 얼마나 높았는지 또는 낮았는지 알아볼 때 씁니다.',
  'guide.candlestick_delta.appearance': '따로 그려지지 않습니다. 촛대 차트와 같은 초를 읽되, 각 가격을 그 시점의 기준선과의 차이로 알려 줍니다.',

  'guide.chord.definition': '코드 다이어그램은 한 집단 안의 구성원들 사이에 오가는 흐름이나 연결을 원 둘레에 배치해 보여 줍니다.',
  'guide.chord.purpose': '누가 누구와 얼마나 주고받는지 보여 줄 때 씁니다. 예를 들어 나라 사이의 무역이나 지역 사이의 인구 이동을 봅니다.',
  'guide.chord.appearance': '구성원들이 원 가장자리를 따라 호 모양으로 놓여 있습니다. 굽은 리본이 원 안쪽을 가로질러 두 구성원을 잇습니다. 리본이 넓을수록 흐름이 큽니다.',

  'guide.choropleth.definition': '단계 구분도는 지역마다 값에 따라 색의 진하기를 달리 칠한 지도입니다.',
  'guide.choropleth.purpose': '어떤 값이 곳에 따라 어떻게 다른지 보여 줄 때 씁니다. 예를 들어 나라별 인구나 시군구별 소득을 봅니다.',
  'guide.choropleth.appearance': '나라나 시도 같은 지역의 경계가 그려진 보통 지도처럼 생겼습니다. 지역마다 색이 칠해져 있고, 보통 값이 클수록 더 진하거나 강한 색입니다. 범례가 색의 뜻을 알려 줍니다.',

  'guide.contour.definition': '등고선 그래프는 값이 같은 지점들을 선으로 이어서, 값의 높낮이를 평평한 종이 위에 보여 줍니다.',
  'guide.contour.purpose': '두 방향으로 변하는 데이터에 씁니다. 예를 들어 등산 지도의 높이나 한 지역의 기온 분포를 봅니다.',
  'guide.contour.appearance': '구불구불한 닫힌 고리들이 안쪽으로 겹겹이 그려져 있습니다. 등산 지도에서 산을 둘러싼 고리와 같습니다. 고리 하나가 값 하나를 나타냅니다. 고리가 촘촘한 곳은 값이 가파르게 변하고, 듬성듬성한 곳은 완만하게 변합니다.',

  'guide.diverging_bar.definition': '발산 막대 그래프는 가운데 선에서 서로 반대 방향으로 뻗는 막대를 보여 줍니다.',
  'guide.diverging_bar.purpose': '서로 맞서는 두 쪽을 비교할 때 씁니다. 예를 들어 찬성과 반대 응답, 또는 인구 피라미드의 남자와 여자를 비교합니다.',
  'guide.diverging_bar.appearance': '가운데에 선이 하나 세로로 있습니다. 항목마다 막대 하나는 왼쪽으로, 다른 하나는 오른쪽으로 뻗습니다. 막대 길이가 값이고, 어느 쪽으로 뻗었는지가 어느 집단인지 알려 줍니다.',

  'guide.dodged_bar.definition': '그룹 막대 그래프는 항목마다 막대 여러 개를 나란히 붙여 놓은 그래프입니다.',
  'guide.dodged_bar.purpose': '항목마다 그 안의 하위 집단을 비교할 때 씁니다. 예를 들어 달마다 여러 제품의 매출을 비교합니다.',
  'guide.dodged_bar.appearance': '항목 축을 따라 작은 막대 묶음들이 있습니다. 묶음마다 하위 집단별로 막대가 하나씩 있고, 같은 기준선에서 나란히 서 있습니다. 보통 막대마다 색이 다릅니다.',

  'guide.dot.definition': '점 그래프는 항목마다 숫자 하나를 점 하나로 보여 줍니다.',
  'guide.dot.purpose': '막대 그래프처럼 항목끼리 값을 비교할 때 씁니다. 잉크를 덜 쓰기 때문에 항목이 많아도 읽기 쉽습니다.',
  'guide.dot.appearance': '한 축을 따라 항목들이 나열되어 있습니다. 항목마다 다른 축에서 그 값의 위치에 점이 하나 찍혀 있습니다.',

  'guide.dumbbell.definition': '덤벨 차트는 항목마다 두 값을 선으로 이어서 보여 줍니다.',
  'guide.dumbbell.purpose': '두 값 사이의 차이나 변화를 보여 줄 때 씁니다. 예를 들어 전과 후, 또는 올해와 작년을 비교합니다.',
  'guide.dumbbell.appearance': '항목마다 점 두 개가 곧은 막대로 이어져 있어서, 헬스장의 아령처럼 보입니다. 막대 길이가 차이의 크기입니다.',

  'guide.error_bar.definition': '오차 막대 그래프는 값과 함께 그 값이 얼마나 불확실한지 보여 줍니다.',
  'guide.error_bar.purpose': '과학과 통계에서 측정값과 그 값이 있을 법한 범위를 보여 줄 때 씁니다. 신뢰 구간이 대표적인 예입니다.',
  'guide.error_bar.appearance': '값마다 점이 있거나 막대의 끝이 있습니다. 그 점을 지나는 가는 선이 아래쪽 한계에서 위쪽 한계까지 이어집니다. 양 끝에 짧은 가로선이 있어 영어 대문자 I처럼 보일 때가 많습니다.',

  'guide.forest.definition': '포리스트 플롯은 같은 질문을 다룬 여러 연구의 결과를 한 줄에 하나씩 보여 주고, 모두 합친 결과도 함께 보여 줍니다.',
  'guide.forest.purpose': '의학 연구와 메타 분석에서 연구들의 결과가 서로 일치하는지, 합친 효과는 얼마인지 볼 때 씁니다.',
  'guide.forest.appearance': '연구들이 위에서 아래로 나열되어 있습니다. 연구마다 추정값 위치에 작은 네모가 있고, 불확실성을 나타내는 가로선이 있습니다. 세로선 하나가 "효과 없음"을 표시합니다. 맨 아래의 마름모가 합친 결과를 보여 줍니다.',

  'guide.gantt.definition': '간트 차트는 작업들을 시간 축 위의 막대로 보여 줍니다.',
  'guide.gantt.purpose': '프로젝트 계획에서 작업마다 언제 시작하고 끝나는지, 얼마나 걸리는지, 어떤 작업이 겹치는지 볼 때 씁니다.',
  'guide.gantt.appearance': '시간은 왼쪽에서 오른쪽으로 흐르고, 작업은 위에서 아래로 나열되어 있습니다. 작업마다 가로 막대가 하나 있고, 시작일에서 시작해 종료일에서 끝납니다.',

  'guide.funnel.definition': '깔때기 차트는 어떤 과정의 단계마다 남아 있는 항목 수를 보여 줍니다.',
  'guide.funnel.purpose': '어디에서 항목이 빠져나가는지 찾을 때 씁니다. 예를 들어 웹사이트 방문자 중 몇 명이 가입하고, 그중 몇 명이 구매하는지 봅니다.',
  'guide.funnel.appearance': '단계들이 위에서 아래로 쌓여 있습니다. 단계마다 가운데에 맞춘 막대가 있고, 아래로 갈수록 막대가 좁아집니다. 그래서 전체 모양이 부엌에서 쓰는 깔때기처럼 보입니다.',

  'guide.gauge.definition': '게이지는 값 하나를 가능한 전체 범위와 함께 보여 줍니다. 자동차 속도계와 비슷합니다.',
  'guide.gauge.purpose': '목표까지 얼마나 왔는지, 또는 측정값이 좋음, 주의, 나쁨 중 어느 구간에 있는지 보여 줄 때 씁니다.',
  'guide.gauge.appearance': '반원이나 곧은 막대가 최솟값부터 최댓값까지 전체 범위를 나타냅니다. 이 범위는 색깔별 구간으로 나뉠 때가 많습니다. 바늘이나 채워진 부분이 현재 값을 가리키고, 목표 지점 표시가 있기도 합니다.',

  'guide.heat.definition': '히트맵은 칸들로 이루어진 격자로, 칸마다 값에 따라 색을 달리 칠합니다.',
  'guide.heat.purpose': '숫자 표에서 패턴을 찾을 때 씁니다. 예를 들어 무슨 요일 몇 시가 가장 붐비는지 봅니다.',
  'guide.heat.appearance': '행과 열이 바둑판 같은 격자를 이룹니다. 칸마다 색이 칠해져 있고, 보통 값이 클수록 더 진하거나 따뜻한 색입니다. 범례가 색의 뜻을 알려 줍니다.',

  'guide.hexbin.definition': '육각 구간 그래프는 산점도를 육각형 칸으로 나누고, 칸마다 점이 몇 개 들어 있는지 셉니다.',
  'guide.hexbin.purpose': '점이 너무 많아 서로 겹쳐 쌓일 때, 점이 가장 몰려 있는 곳을 보여 주려고 씁니다.',
  'guide.hexbin.appearance': '그래프 영역이 벌집처럼 육각형으로 덮여 있습니다. 육각형마다 들어 있는 점 수에 따라 색이 다르고, 점이 많을수록 더 진합니다.',

  'guide.hist.definition': '히스토그램은 숫자들이 어떻게 분포하는지 보여 줍니다. 구간마다 몇 개의 값이 들어가는지 셉니다.',
  'guide.hist.purpose': '데이터의 모양을 볼 때 씁니다. 값이 주로 어디에 몰려 있는지, 얼마나 퍼져 있는지, 한쪽으로 치우쳐 있는지 알 수 있습니다.',
  'guide.hist.appearance': '세로 막대들이 틈 없이 나란히 서 있습니다. 막대마다 아래 축에서 값의 한 구간을 차지하고, 막대 높이는 그 구간에 들어가는 값의 개수입니다.',

  'guide.line.definition': '꺾은선 그래프는 여러 값을 선으로 이어 줍니다. 보통 시간 순서대로 잇습니다.',
  'guide.line.purpose': '흐름을 보여 줄 때 씁니다. 예를 들어 날마다 또는 해마다 기온이나 주가가 어떻게 변하는지 봅니다.',
  'guide.line.appearance': '시간이나 순서가 있는 값이 왼쪽에서 오른쪽으로 흐릅니다. 값이 오르면 선이 올라가고, 떨어지면 내려갑니다. 한 그래프에 선이 여러 개 있을 수 있고, 계열마다 선이 하나씩입니다.',

  'guide.lollipop.definition': '롤리팝 차트는 항목마다 숫자 하나를 끝에 점이 달린 가는 막대로 보여 줍니다.',
  'guide.lollipop.purpose': '막대 그래프처럼 항목끼리 값을 비교할 때 씁니다. 더 가벼운 느낌을 줍니다.',
  'guide.lollipop.appearance': '같은 기준선에서 항목마다 가는 선이 올라가고, 값의 위치에서 동그란 점으로 끝납니다. 막대 사탕처럼 생겼습니다.',

  'guide.manhattan.definition': '맨해튼 플롯은 유전체의 여러 위치를 검사한 결과를 위치마다 점 하나로 보여 줍니다.',
  'guide.manhattan.purpose': '유전학에서 어떤 형질이나 질병과 강하게 관련된 몇 안 되는 위치를 찾을 때 씁니다.',
  'guide.manhattan.appearance': '위치는 왼쪽에서 오른쪽으로 흐르고, 염색체별로 묶여 색이 번갈아 바뀝니다. 높이는 신호의 세기입니다. 대부분의 점은 낮게 깔려 있고, 몇 개만 높은 탑처럼 솟아 있습니다. 맨해튼의 고층 빌딩 스카이라인 같습니다.',

  'guide.mosaic.definition': '모자이크 플롯은 두 범주가 어떻게 섞이는지 보여 줍니다. 조각의 넓이가 각 조합의 비율과 같습니다.',
  'guide.mosaic.purpose': '개수를 센 표에서 관계를 살펴볼 때 씁니다. 예를 들어 승객 등급별 생존 여부를 봅니다.',
  'guide.mosaic.appearance': '직사각형 하나가 여러 열로 나뉘고, 열의 너비는 각 집단의 크기와 같습니다. 각 열은 다시 위에서 아래로 여러 조각으로 나뉘고, 조각의 높이는 하위 집단의 비율과 같습니다.',

  'guide.network.definition': '네트워크 다이어그램은 항목을 점으로, 항목 사이의 연결을 선으로 보여 줍니다.',
  'guide.network.purpose': '관계를 보여 줄 때 씁니다. 예를 들어 사람 사이의 친구 관계나 웹 페이지 사이의 링크를 보고, 가장 많이 연결된 항목을 찾습니다.',
  'guide.network.appearance': '노드라고 부르는 작은 원들이 페이지 곳곳에 흩어져 있습니다. 링크라고 부르는 선이 노드 두 개를 잇습니다. 연결이 많은 항목은 가운데에 놓이고, 그 주위로 선이 사방으로 뻗어 나갈 때가 많습니다.',

  'guide.stacked_normalized_bar.definition': '100% 누적 막대 그래프는 항목마다 전체 길이가 같은 막대를 하나씩 두고, 그 막대를 백분율 조각으로 나눕니다.',
  'guide.stacked_normalized_bar.purpose': '항목끼리 비율을 비교할 때 씁니다. 예를 들어 여러 나라에서 연령대별 인구 비율을 비교합니다.',
  'guide.stacked_normalized_bar.appearance': '모든 막대의 길이가 같고, 그 길이가 100퍼센트를 뜻합니다. 막대마다 색깔 조각들이 끝과 끝을 이어 쌓여 있고, 조각의 크기가 그 부분의 비율입니다.',

  'guide.stacked_normalized_area.definition': '100% 누적 영역 그래프는 전체를 이루는 여러 부분의 비율이 시간에 따라 어떻게 변하는지 보여 줍니다.',
  'guide.stacked_normalized_area.purpose': '시간에 따른 비율 변화를 따라갈 때 씁니다. 예를 들어 해마다 에너지원별로 차지하는 비율을 봅니다.',
  'guide.stacked_normalized_area.appearance': '그래프 전체가 0에서 100퍼센트까지 꽉 찬 직사각형입니다. 색깔 띠들이 위로 쌓여 늘 그 직사각형을 빈틈없이 채웁니다. 비율이 커지면 띠가 두꺼워지고, 작아지면 얇아집니다.',

  'guide.parallel_coordinates.definition': '평행 좌표 그래프는 측정값이 많은 항목들을 항목마다 선 하나로 보여 줍니다.',
  'guide.parallel_coordinates.purpose': '여러 변수에 걸쳐 항목들을 한꺼번에 비교하고, 서로 비슷한 항목들의 무리를 찾을 때 씁니다.',
  'guide.parallel_coordinates.appearance': '세로 축 여러 개가 나란히 서 있고, 축 하나가 측정값 하나입니다. 항목마다 지그재그 선이 하나씩 있고, 그 선은 모든 축을 지나며 각 축에서 자기 값의 위치를 지납니다.',

  'guide.pie.definition': '원 그래프는 전체가 어떻게 여러 부분으로 나뉘는지 원의 조각으로 보여 줍니다.',
  'guide.pie.purpose': '전체에서 각 부분이 차지하는 몫을 보여 줄 때 씁니다. 예를 들어 예산이 부서별로 어떻게 나뉘는지 봅니다.',
  'guide.pie.appearance': '피자를 자르듯 원이 가운데에서부터 부채꼴 조각으로 나뉘어 있습니다. 몫이 클수록 조각이 넓고, 모든 조각을 합하면 원 하나가 됩니다.',

  'guide.polar_area.definition': '극좌표 영역 차트는 장미 차트라고도 부릅니다. 각도가 모두 같은 부채꼴이 값에 따라 바깥으로 다르게 뻗어 나갑니다.',
  'guide.polar_area.purpose': '1월부터 12월까지의 달이나 동서남북 방향처럼 한 바퀴 돌아오는 범주의 값을 비교할 때 씁니다.',
  'guide.polar_area.appearance': '부채꼴들이 같은 중심에서 꽃잎처럼 펼쳐져 있고, 모두 각도가 같습니다. 부채꼴이 중심에서 멀리 뻗을수록 값이 큽니다.',

  'guide.radar.definition': '레이더 차트는 거미줄 차트라고도 부릅니다. 한 항목의 여러 측정값을 원 모양으로 배치한 축 위에 보여 줍니다.',
  'guide.radar.purpose': '여러 능력에 걸친 강점과 약점을 비교할 때 씁니다. 예를 들어 운동선수의 능력치를 봅니다.',
  'guide.radar.appearance': '바퀴살처럼 가운데 점에서 살이 여러 개 뻗어 나가고, 살 하나가 측정값 하나입니다. 값마다 자기 살 위에 점이 있고, 값이 클수록 바깥쪽에 있습니다. 이 점들을 이으면 거미줄 같은 닫힌 도형이 됩니다.',

  'guide.ridgeline.definition': '릿지라인 플롯은 여러 집단의 분포를 매끄러운 곡선으로 그려 위아래로 겹쳐 쌓습니다.',
  'guide.ridgeline.purpose': '여러 집단의 데이터 모양을 비교할 때 씁니다. 예를 들어 달마다 기온 분포를 비교합니다.',
  'guide.ridgeline.appearance': '집단마다 언덕 모양의 곡선이 있고, 흔한 값이 있는 곳에서 곡선이 높습니다. 곡선들이 페이지 아래로 조금씩 겹치며 쌓여 있어서, 멀리서 바라본 겹겹의 산능선처럼 보입니다.',

  'guide.roc.definition': 'ROC 곡선은 검사나 예측 모델이 아픈 사람과 건강한 사람 같은 두 결과를 얼마나 잘 가려내는지 보여 줍니다.',
  'guide.roc.purpose': '분류 모델을 평가하고, 진짜 사례를 잡아내는 것과 잘못된 경보를 줄이는 것 사이에서 균형 잡힌 기준값을 고를 때 씁니다.',
  'guide.roc.appearance': '정사각형의 왼쪽 아래 모서리에서 오른쪽 위 모서리까지 곡선이 올라갑니다. 대각선 하나가 무작위로 찍는 경우를 나타냅니다. 곡선이 왼쪽 위 모서리 쪽으로 많이 휠수록 좋은 모델입니다.',

  'guide.rug.definition': '러그 플롯은 관측값 하나하나를 축을 따라 짧은 눈금으로 표시합니다.',
  'guide.rug.purpose': '개별 값이 정확히 어디에 있고 어디에 몰려 있는지 보여 줄 때 씁니다. 다른 차트 옆에 함께 그릴 때가 많습니다.',
  'guide.rug.appearance': '차트 한쪽 가장자리를 따라 짧은 선들이 줄지어 있습니다. 러그 가장자리의 술 장식 같습니다. 선 하나가 값 하나이고, 값이 몰린 곳은 빽빽한 솔처럼 보입니다.',

  'guide.sankey.definition': '생키 다이어그램은 어떤 양이 한 단계에서 다음 단계로 어떻게 흘러가는지 보여 줍니다.',
  'guide.sankey.purpose': '무언가가 어디에서 와서 어디로 가는지 따라갈 때 씁니다. 예를 들어 에너지가 공급원에서 쓰임새로 가는 흐름이나, 예산 속 돈의 흐름을 봅니다.',
  'guide.sankey.appearance': '노드라고 부르는 블록들이 왼쪽에서 오른쪽으로 여러 열에 서 있습니다. 띠가 한 노드에서 다른 노드로 흐르고, 띠의 너비는 그 길로 흐르는 양입니다.',

  'guide.point.definition': '산점도는 두 숫자 사이의 관계를 보여 주며, 항목마다 점을 하나씩 찍습니다.',
  'guide.point.purpose': '키와 몸무게처럼 두 값이 서로 관련이 있는지 볼 때 씁니다. 점들이 모인 무리나 튀는 점을 찾을 때도 씁니다.',
  'guide.point.appearance': '평평한 영역에 점들이 흩어져 있습니다. 점의 좌우 위치가 한 값이고, 위아래 위치가 다른 값입니다. 점들이 오른쪽 위로 올라가는 띠를 이루면, 두 값이 함께 커지는 경향이 있다는 뜻입니다.',

  'guide.smooth.definition': '평활 곡선 그래프는 데이터 점들 사이로 곡선을 맞춰 그려 전체적인 흐름을 보여 줍니다.',
  'guide.smooth.purpose': '들쭉날쭉한 데이터에서 자잘한 오르내림에 흔들리지 않고 전체 방향을 볼 때 씁니다.',
  'guide.smooth.appearance': '완만한 곡선 하나가 데이터 한가운데를 지나 왼쪽에서 오른쪽으로 이어집니다. 모든 점을 지나지는 않습니다. 산점도 위에 겹쳐 그릴 때가 많고, 곡선 주위에 옅게 칠한 띠가 있기도 합니다.',

  'guide.sunflower.definition': '해바라기 플롯은 같은 자리에 여러 번 찍힌 점을 꽃잎이 달린 표시 하나로 그린 산점도입니다.',
  'guide.sunflower.purpose': '관측값 여러 개가 정확히 같은 값을 가질 때, 그 자리에 몇 개가 있는지 가려지지 않게 하려고 씁니다.',
  'guide.sunflower.appearance': '산점도처럼 생겼지만, 어떤 점에는 꽃잎처럼 짧은 선들이 튀어나와 있습니다. 꽃잎 수가 그 자리에 있는 관측값의 수입니다.',

  'guide.stacked_bar.definition': '누적 막대 그래프는 항목마다 여러 부분을 위로 쌓아 만든 막대 하나를 보여 줍니다.',
  'guide.stacked_bar.purpose': '항목마다 합계와 그 합계가 무엇으로 이루어졌는지를 함께 보여 줄 때 씁니다. 예를 들어 제품별로 나눈 전체 매출을 봅니다.',
  'guide.stacked_bar.appearance': '막대들이 나란히 서 있습니다. 막대마다 색깔 조각들이 하나씩 위로 쌓여 있습니다. 막대 전체 높이가 합계이고, 조각 하나가 한 부분입니다.',

  'guide.stacked_area.definition': '누적 영역 그래프는 시간에 따른 여러 양을 위로 차곡차곡 쌓아 보여 줍니다.',
  'guide.stacked_area.purpose': '합계가 시간에 따라 어떻게 변하고, 각 부분이 그 합계에 얼마나 보태는지 보여 줄 때 씁니다.',
  'guide.stacked_area.appearance': '색깔 띠들이 아래에서부터 겹겹이 쌓여 있고, 띠마다 바로 아래 띠 위에 얹혀 있습니다. 가장 위 띠의 윗선이 합계이고, 띠의 두께가 그 부분의 양입니다.',

  'guide.step.definition': '계단 그래프는 비스듬한 선 대신 평평한 계단 모양으로 움직이는 꺾은선 그래프입니다.',
  'guide.step.purpose': '가격, 금리, 개수처럼 한동안 그대로 있다가 갑자기 바뀌는 값에 씁니다.',
  'guide.step.appearance': '선이 평평하게 가다가 곧장 위나 아래로 꺾이고, 다시 평평하게 갑니다. 옆에서 본 계단 같습니다.',

  'guide.survival.definition': '생존 곡선은 시간이 지나면서 한 집단 가운데 아직 어떤 사건을 겪지 않은 비율을 보여 줍니다.',
  'guide.survival.purpose': '의학과 공학에서 사람이나 기계가 얼마나 오래 버티는지 비교할 때 씁니다. 예를 들어 두 가지 치료를 받은 환자들을 비교합니다.',
  'guide.survival.appearance': '선이 왼쪽 위 100퍼센트에서 시작해, 사건이 일어날 때마다 오른쪽으로 가며 한 계단씩 내려갑니다. 곡선이 오래 높게 머물수록 생존이 좋다는 뜻입니다. 연구에서 빠진 사람은 작은 눈금으로 표시되기도 합니다.',

  'guide.icicle.definition': '아이시클 차트는 폴더와 파일 같은 계층 구조를 직사각형 층으로 보여 줍니다.',
  'guide.icicle.purpose': '전체가 여러 부분으로, 그 부분이 다시 더 작은 부분으로 어떻게 나뉘는지 볼 때 씁니다.',
  'guide.icicle.appearance': '맨 위에 전체를 나타내는 긴 막대가 있습니다. 그 아래에서 다음 단계의 부분들로 나뉘고, 그 부분들이 또 그 아래에서 나뉩니다. 처마 끝에 매달린 고드름 같습니다. 폭이 넓을수록 큰 부분입니다.',

  'guide.sunburst.definition': '선버스트 차트는 계층 구조를 가운데를 둘러싼 고리들로 보여 줍니다.',
  'guide.sunburst.purpose': '전체가 여러 단계에 걸쳐 어떻게 나뉘는지 볼 때 씁니다. 예를 들어 회사 예산을 부서별, 팀별로 나눠 봅니다.',
  'guide.sunburst.appearance': '가운데 원이 전체입니다. 바깥쪽 고리로 갈수록 한 단계씩 아래 계층이며, 고리마다 호 모양 조각으로 나뉩니다. 조각은 자기 상위 조각의 바로 바깥에 붙어 있고, 호가 넓을수록 몫이 큽니다.',

  'guide.tree.definition': '트리 다이어그램은 계층 구조를 선으로 이어진 상자들로 보여 줍니다. 뿌리 하나에서 가지들이 뻗어 나갑니다.',
  'guide.tree.purpose': '조직도, 족보, 여러 갈래의 결정처럼 구조를 보여 줄 때 씁니다.',
  'guide.tree.appearance': '맨 위나 맨 왼쪽에 항목 하나가 있습니다. 거기서 선이 가지처럼 뻗어 자식 항목으로 이어지고, 자식 항목에서 다시 그 자식으로 뻗어 나갑니다. 거꾸로 선 나무 같습니다.',

  'guide.pack.definition': '원 채우기는 계층 구조를 원 안에 원을 넣는 방식으로 보여 줍니다.',
  'guide.pack.purpose': '대륙 안의 나라들처럼 묶음 안의 묶음과 그 크기를 보여 줄 때 씁니다.',
  'guide.pack.appearance': '큰 원 하나 안에 작은 원들이 있고, 그 안에 더 작은 원들이 있기도 합니다. 비눗방울 안의 비눗방울 같습니다. 원의 크기가 값을 나타냅니다.',

  'guide.treemap.definition': '트리맵은 계층 구조를 겹겹이 들어간 직사각형으로 보여 주며, 직사각형의 넓이가 값과 같습니다.',
  'guide.treemap.purpose': '전체에서 어느 부분이 가장 큰지 볼 때 씁니다. 예를 들어 어느 폴더가 디스크 공간을 가장 많이 차지하는지 봅니다.',
  'guide.treemap.appearance': '큰 직사각형이 조각보처럼 작은 직사각형들로 빈틈없이 채워져 있습니다. 값이 클수록 조각이 크고, 같은 묶음에 속한 조각들은 더 큰 조각 안에 함께 모여 있습니다.',

  'guide.violin_box.definition': '바이올린 상자 그림은 바이올린 플롯 안에 그린 상자 그림으로, 집단마다 다섯 개의 값으로 요약합니다.',
  'guide.violin_box.purpose': '바이올린 모양과 함께 집단마다 가장 작은 값, 아래쪽 4분의 1 지점, 가운데 값, 위쪽 4분의 1 지점, 가장 큰 값을 읽을 때 씁니다.',
  'guide.violin_box.appearance': '바이올린 모양마다 그 안에 좁은 상자가 하나 있습니다. 상자에는 가운데 값 표시가 있고, 가는 수염이 위아래로 가장 작은 값과 가장 큰 값까지 뻗어 있습니다.',

  'guide.violin_kde.definition': '바이올린 플롯은 한 집단의 데이터 모양을 좌우 대칭인 매끄러운 윤곽선으로 보여 줍니다.',
  'guide.violin_kde.purpose': '여러 집단의 분포를 비교할 때 씁니다. 값이 흔한 곳과 드문 곳을 보여 줍니다.',
  'guide.violin_kde.appearance': '집단마다 모양이 하나 있고, 값이 많은 곳은 넓고 적은 곳은 좁습니다. 가운데 선을 중심으로 양쪽이 똑같아서, 바이올린이나 꽃병처럼 보일 때가 많습니다.',

  'guide.volcano.definition': '화산 플롯은 많은 항목에 대해 변화가 얼마나 큰지, 통계적으로 얼마나 의미 있는지를 한꺼번에 보여 줍니다.',
  'guide.volcano.purpose': '생물학에서 두 조건 사이에 크고 확실하게 변하는 유전자나 단백질을 골라낼 때 씁니다.',
  'guide.volcano.appearance': '점들이 분화하는 화산 같은 모양을 이룹니다. 좌우 위치는 변화의 크기와 방향이고, 높이는 유의성입니다. 눈여겨볼 항목은 왼쪽 위와 오른쪽 위 모서리에 있습니다.',

  'guide.waterfall.definition': '폭포 차트는 시작 값이 여러 번의 증가와 감소를 거쳐 최종 값에 이르는 과정을 보여 줍니다.',
  'guide.waterfall.purpose': '합계를 한 단계씩 설명할 때 씁니다. 예를 들어 매출과 비용이 모여 이익이 되는 과정을 봅니다.',
  'guide.waterfall.appearance': '첫 막대는 기준선 위에 서 있습니다. 그다음 막대들은 공중에 떠 있으며, 앞 막대가 끝난 곳에서 시작해 증가면 위로, 감소면 아래로 갑니다. 계단 같은 모양입니다. 마지막 막대는 다시 기준선 위에 서서 최종 합계를 보여 줍니다.',

  'guide.word_cloud.definition': '워드 클라우드는 글에 나온 단어들을 보여 주며, 자주 나오거나 중요한 단어일수록 크게 그립니다.',
  'guide.word_cloud.purpose': '글, 설문 응답, 소셜 미디어 게시물의 주요 주제를 빠르게 파악할 때 씁니다.',
  'guide.word_cloud.appearance': '단어들이 한 덩어리로 빽빽하게 모여 있고, 크기가 제각각이며 방향이 다른 것도 있습니다. 가장 큰 단어가 가장 자주 나온 단어입니다.',
} satisfies Partial<Record<MessageKey, string>>;
