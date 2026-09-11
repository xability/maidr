import type { MessageKey } from '../index';

export const rotor = {
  // Mode names, announced when the rotor lands on a mode.
  'rotor.higherValueMode': '높은 값 탐색',
  'rotor.lowerValueMode': '낮은 값 탐색',
  'rotor.dataMode': '데이터 점 탐색',
  'rotor.rowColMode': '행과 열 탐색',
  'rotor.gridMode': '격자 탐색',
  'rotor.intersectionMode': '교차점 탐색',
  'rotor.pointMode': '점 탐색',
  'rotor.gridModeDimensions': '격자 탐색: {rows}행 {cols}열 격자',

  // Directions, and the nouns the boundary messages name.
  'rotor.directionAbove': '위쪽',
  'rotor.directionBelow': '아래쪽',
  'rotor.directionLeft': '왼쪽',
  'rotor.directionRight': '오른쪽',
  'rotor.lowerValueNoun': '더 낮은 값',
  'rotor.higherValueNoun': '더 높은 값',
  'rotor.pointNoun': '점',
  'rotor.gridValueNoun': '격자 값',

  // Nothing further in that direction.
  'rotor.noneFoundVerticalTerse': '{direction}에 {noun|이가} 없습니다',
  'rotor.noneFoundVerticalVerbose': '현재 값의 {direction}에 {noun|이가} 없습니다.',
  'rotor.noneFoundHorizontalTerse': '{direction}에 {noun|이가} 없습니다',
  'rotor.noneFoundHorizontalVerbose': '현재 값의 {direction}에 {noun|이가} 없습니다.',

  // Modes that navigate along one axis only.
  'rotor.filterVerticalUnavailableTerse': '{noun} 모드에서는 위아래 이동을 할 수 없습니다',
  'rotor.filterVerticalUnavailableVerbose': '{noun} 모드에서는 위아래 이동을 사용할 수 없습니다.',
  'rotor.intersectionVerticalUnavailableTerse': '교차점 모드에서는 위아래 이동을 할 수 없습니다',
  'rotor.intersectionVerticalUnavailableVerbose': '교차점 탐색 모드에서는 위아래 이동을 사용할 수 없습니다.',

  // Intersection mode.
  'rotor.intersectionUnavailableTerse': '교차점 모드를 사용할 수 없습니다',
  'rotor.intersectionUnavailableVerbose': '현재 상황에서는 교차점 탐색을 사용할 수 없습니다.',
  'rotor.noIntersectionTerse': '{direction}에 교차점이 없습니다',
  'rotor.noIntersectionVerbose': '현재 점의 {direction}에 교차점이 없습니다.',
} satisfies Partial<Record<MessageKey, string>>;
