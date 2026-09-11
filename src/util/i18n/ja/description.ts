import type { MessageKey } from '../index';

export const description = {
  'description.statOrientation': '向き',
  'description.statSubtitle': 'サブタイトル',
  'description.statCaption': 'キャプション',
  'description.statCurrentlyOn': '現在の位置',
  'description.statChartTypes': 'チャートの種類',
  'description.multiPanelFigure': '複数パネルの図',
  'description.valueInfinity': '無限大',
  'description.valueNegativeInfinity': '負の無限大',
  'description.subplotPosition': '{total}個中{index}番目のサブプロット',
  'description.chartTypeCount': '{kind} ({count})',

  'description.title': 'チャートの説明',
  'description.close': '閉じる',
  'description.chartTypePrefix': 'チャートの種類: ',
  'description.titleLabel': 'タイトル',
  'description.titleLabelSubplot': 'サブプロットのタイトル',
  'description.titleLabelFigure': '図のタイトル',
  'description.axesHeading': '軸',
  'description.axisEntry': '{axis}軸: {label}',
  'description.summaryHeading': '概要',
  'description.subplotsHeading': 'サブプロット ({count})',
  'description.subplotUnknown': '不明',
  'description.subplotCurrent': ' (現在)',

  'description.layersHeading': 'レイヤー ({count})',
  'description.showingLayer': '{total}個中{index}番目のレイヤーを表示しています',
  'description.layerHint': '左右の矢印キーでレイヤーを移動し、Space キーで開きます。',
  'description.layerUpdated': '{total}個中{index}番目のレイヤーの説明に更新しました',

  'description.rowOne': '行',
  'description.rowMany': '行',
  'description.tableCaption': 'データ: {total}{rows}',
  'description.tableCaptionTruncated': 'データ: 全{total}{rows}のうち{shown}{rows}を表示',
  'description.tableShowMore': '全{total}{rows}のうちさらに{count}{rows}を表示',
  'description.tableColumn': '{index}列目',
} satisfies Partial<Record<MessageKey, string>>;
