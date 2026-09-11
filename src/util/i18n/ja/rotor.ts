import type { MessageKey } from '../index';

export const rotor = {
  // Mode names, announced when the rotor lands on a mode.
  'rotor.higherValueMode': '高い値のナビゲーション',
  'rotor.lowerValueMode': '低い値のナビゲーション',
  'rotor.dataMode': 'データポイントのナビゲーション',
  'rotor.rowColMode': '行と列のナビゲーション',
  'rotor.gridMode': 'グリッドのナビゲーション',
  'rotor.intersectionMode': '交点のナビゲーション',
  'rotor.pointMode': 'ポイントのナビゲーション',
  'rotor.gridModeDimensions': 'グリッドのナビゲーション: {rows}行{cols}列のグリッド',

  // Directions, and the nouns the boundary messages name.
  'rotor.directionAbove': '上',
  'rotor.directionBelow': '下',
  'rotor.directionLeft': '左',
  'rotor.directionRight': '右',
  'rotor.lowerValueNoun': 'より低い値',
  'rotor.higherValueNoun': 'より高い値',
  'rotor.pointNoun': 'ポイント',
  'rotor.gridValueNoun': 'グリッドの値',

  // Nothing further in that direction.
  'rotor.noneFoundVerticalTerse': '{direction}に{noun}はありません',
  'rotor.noneFoundVerticalVerbose': '現在の値の{direction}に{noun}はありません。',
  'rotor.noneFoundHorizontalTerse': '{direction}に{noun}はありません',
  'rotor.noneFoundHorizontalVerbose': '現在の値の{direction}に{noun}はありません。',

  // Modes that navigate along one axis only.
  'rotor.filterVerticalUnavailableTerse': '{noun}モードでは上下の移動はできません',
  'rotor.filterVerticalUnavailableVerbose': '{noun}モードでは上下の移動は使用できません。',
  'rotor.intersectionVerticalUnavailableTerse': '交点モードでは上下の移動はできません',
  'rotor.intersectionVerticalUnavailableVerbose': '交点モードでは上下の移動は使用できません。',

  // Intersection mode.
  'rotor.intersectionUnavailableTerse': '交点モードは使用できません',
  'rotor.intersectionUnavailableVerbose': '現在の状況では交点のナビゲーションは使用できません。',
  'rotor.noIntersectionTerse': '{direction}に交点はありません',
  'rotor.noIntersectionVerbose': '現在のポイントの{direction}に交点はありません。',
} satisfies Partial<Record<MessageKey, string>>;
