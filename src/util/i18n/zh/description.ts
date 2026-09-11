import type { MessageKey } from '../index';

export const description = {
  'description.statOrientation': '方向',
  'description.statSubtitle': '副标题',
  'description.statCaption': '说明文字',
  'description.statCurrentlyOn': '当前位置',
  'description.statChartTypes': '图表类型',
  'description.multiPanelFigure': '多面板图形',
  'description.valueInfinity': '无穷大',
  'description.valueNegativeInfinity': '负无穷大',
  'description.subplotPosition': '第 {index} 个子图，共 {total} 个',
  'description.chartTypeCount': '{kind}（{count}）',

  'description.title': '图表描述',
  'description.close': '关闭',
  'description.chartTypePrefix': '图表类型：',
  'description.titleLabel': '标题',
  'description.titleLabelSubplot': '子图标题',
  'description.titleLabelFigure': '图形标题',
  'description.axesHeading': '坐标轴',
  'description.axisEntry': '{axis} 轴：{label}',
  'description.summaryHeading': '摘要',
  'description.subplotsHeading': '子图（{count}）',
  'description.subplotUnknown': '未知',
  'description.subplotCurrent': '（当前）',

  'description.layersHeading': '图层（{count}）',
  'description.showingLayer': '正在显示第 {index} 个图层，共 {total} 个',
  'description.layerHint': '使用左右方向键在图层之间移动，按空格键打开图层。',
  'description.layerUpdated': '描述已更新为第 {index} 个图层，共 {total} 个',

  'description.rowOne': '行',
  'description.rowMany': '行',
  'description.tableCaption': '数据：{total} {rows}',
  'description.tableCaptionTruncated': '数据：显示 {shown} {rows}，共 {total} {rows}',
  'description.tableShowMore': '再显示 {count} {rows}，共 {total} {rows}',
  'description.tableColumn': '第 {index} 列',
} satisfies Partial<Record<MessageKey, string>>;
