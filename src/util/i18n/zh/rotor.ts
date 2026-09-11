import type { MessageKey } from '../index';

export const rotor = {
  // Mode names, announced when the rotor lands on a mode.
  'rotor.higherValueMode': '更高值导航',
  'rotor.lowerValueMode': '更低值导航',
  'rotor.dataMode': '数据点导航',
  'rotor.rowColMode': '行列导航',
  'rotor.gridMode': '网格导航',
  'rotor.intersectionMode': '交点导航',
  'rotor.pointMode': '点导航',
  'rotor.gridModeDimensions': '网格导航：{rows} 行 {cols} 列网格',

  // Directions, and the nouns the boundary messages name.
  'rotor.directionAbove': '上方',
  'rotor.directionBelow': '下方',
  'rotor.directionLeft': '左侧',
  'rotor.directionRight': '右侧',
  'rotor.lowerValueNoun': '更低的值',
  'rotor.higherValueNoun': '更高的值',
  'rotor.pointNoun': '点',
  'rotor.gridValueNoun': '网格值',

  // Nothing further in that direction.
  'rotor.noneFoundVerticalTerse': '{direction}没有{noun}',
  'rotor.noneFoundVerticalVerbose': '当前值的{direction}没有{noun}。',
  'rotor.noneFoundHorizontalTerse': '{direction}没有{noun}',
  'rotor.noneFoundHorizontalVerbose': '当前值的{direction}没有{noun}。',

  // Modes that navigate along one axis only.
  'rotor.filterVerticalUnavailableTerse': '{noun}模式下不能上下移动',
  'rotor.filterVerticalUnavailableVerbose': '{noun}模式下无法使用上下导航。',
  'rotor.intersectionVerticalUnavailableTerse': '交点模式下不能上下移动',
  'rotor.intersectionVerticalUnavailableVerbose': '交点模式下无法使用上下导航。',

  // Intersection mode.
  'rotor.intersectionUnavailableTerse': '交点模式不可用',
  'rotor.intersectionUnavailableVerbose': '当前环境下无法使用交点导航。',
  'rotor.noIntersectionTerse': '{direction}没有交点',
  'rotor.noIntersectionVerbose': '当前点的{direction}没有交点。',
} satisfies Partial<Record<MessageKey, string>>;
