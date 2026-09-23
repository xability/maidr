import type { MessageKey } from '../index';

export const guide = {
  // Dialog chrome.
  'guide.toggle': '关于这种图表：{chartType}',
  'guide.definitionHeading': '它是什么',
  'guide.purposeHeading': '它用来做什么',
  'guide.appearanceHeading': '它长什么样',

  // Multi-panel figure.
  'guide.figure.definition': '多面板图形是把几张小图表并排或按网格摆在一起，共用一个总标题。',
  'guide.figure.purpose': '它用来一眼比较几组相关的数据，比如同一项指标在不同人群或不同年份的情况。',
  'guide.figure.appearance': '想象一页纸被分成几个格子，就像一扇有好几块玻璃的窗户。每个格子里都有一张自己的图表，有自己的坐标轴。你可以一次进入一个面板。',

  'guide.area.definition': '面积图就是一张折线图，只是把折线和底部坐标轴之间的空间涂满了。',
  'guide.area.purpose': '它用来展示一个数量随时间怎样涨落，也让人更容易感受到这个数量的总体大小。',
  'guide.area.appearance': '一条线从左往右延伸，随着数值上下起伏。线下面一直到底线的部分都被填满，看起来就像从侧面看到的一座座山峰。',

  'guide.alluvial.definition': '冲积图展示的是事物在几个步骤之间怎样从一组转到另一组。',
  'guide.alluvial.purpose': '它用来追踪分组的变化，比如选民在两次选举之间从哪个党派转到了哪个党派。',
  'guide.alluvial.appearance': '从左到右排着几列，每一列代表一个步骤，列里是上下叠在一起的方块。相邻两列之间有弯曲的带子流过。带子越粗，说明走这条路的事物越多。',

  'guide.bar.definition': '条形图用一根长条表示每个类别的一个数值。',
  'guide.bar.purpose': '它用来比较不同类别的数量，比如每个月的销售额，或每位候选人的得票数。',
  'guide.bar.appearance': '一个个宽度相同的长方形并排站着，都从同一条底线出发。长条越长，数值越大。长条可以竖着立，也可以横着躺。',

  'guide.bump.definition': '凹凸图展示几个竞争者的排名随时间怎样变化。',
  'guide.bump.purpose': '它用来跟踪谁是第一、第二、第三，并看出谁在什么时候超过了谁，比如联赛积分榜上的球队。',
  'guide.bump.appearance': '时间从左往右走，名次从上往下排，第一名在最上面。每个竞争者是一条线，每个时间点上有一个圆点。两条线交叉的地方，就是两者名次互换的时候。',

  'guide.box.definition': '箱线图用五个数来概括一组数字：最小值、下四分位数、中位数、上四分位数和最大值。',
  'guide.box.purpose': '它用来比较几组数据的分散程度和中间位置，也用来找出不寻常的数值，这些数值叫作离群值。',
  'guide.box.appearance': '每一组有一个箱子，箱子中间有一条横线，标出中位数。箱子两头各伸出一条细线，叫作须线，一直伸到一般情况下的最小值和最大值。离群值是须线外面的小圆点。',

  'guide.boxen.definition': '字母值图是箱线图的扩展版，它把数据切得更细，尤其是两头的极端部分。',
  'guide.boxen.purpose': '它用于数据量很大的情况。这时普通箱线图会把极端值的细节藏得太多。',
  'guide.boxen.appearance': '每一组看起来像一摞箱子，以中位数为中心叠放。最宽的箱子装着中间一半的数据，越往外箱子越小，每个装着更靠两头的一小段数据，整体像一座阶梯状的金字塔。',

  'guide.candlestick.definition': 'K 线图展示价格在每个时间段里怎样变动，比如每一天。',
  'guide.candlestick.purpose': '它用在金融领域，用来读出股票或货币在每个时间段的开盘价、最高价、最低价和收盘价。',
  'guide.candlestick.appearance': '时间从左往右走，每个时间段一根蜡烛。每根蜡烛有一段粗粗的实体，上下两端是开盘价和收盘价。实体上下各伸出一条细线，叫作影线，分别伸到最高价和最低价。价格上涨和下跌时，实体通常是两种不同的颜色。',

  'guide.candlestick_delta.definition': 'K 线参考线差值把 K 线图里的每根蜡烛和一条参考线作比较，比如移动平均线。',
  'guide.candlestick_delta.purpose': '它用来说明每个时间段的价格比平时的水平高了多少或低了多少。',
  'guide.candlestick_delta.appearance': '它没有单独画出来。它读取的就是 K 线图上的那些蜡烛，只是把每个价格报告成与同一时间参考线的差值。',

  'guide.chord.definition': '和弦图把一组成员排成一圈，展示它们之间的流动或联系。',
  'guide.chord.purpose': '它用来展示谁和谁之间往来了多少，比如国家之间的贸易，或地区之间的人口迁移。',
  'guide.chord.appearance': '成员是一段段弧线，围在圆圈的边上。弯曲的彩带穿过圆圈内部，把两个成员连起来。彩带越宽，流量越大。',

  'guide.choropleth.definition': '分级统计地图是一种地图，每个区域按照某个数值涂上深浅不同的颜色。',
  'guide.choropleth.purpose': '它用来展示某项指标在不同地方有什么差别，比如各国的人口，或各县的收入。',
  'guide.choropleth.appearance': '它看起来就像一张普通地图，国家或省份等区域都有边界。每个区域涂上一种颜色，数值越高，颜色通常越深或越浓。旁边有图例说明颜色代表的范围。',

  'guide.contour.definition': '等高线图用线把数值相同的点连起来，在一张平面上展示一片起伏的数值。',
  'guide.contour.purpose': '它用于在两个方向上都有变化的数据，比如登山地图上的海拔，或一个地区各处的气温。',
  'guide.contour.appearance': '一圈圈弯弯曲曲的闭合线套在一起，就像登山地图上围着山头的等高线。每一圈代表一个数值。线圈挨得越紧，数值变化越陡；线圈离得越远，变化越平缓。',

  'guide.diverging_bar.definition': '发散条形图的长条从一条中线出发，向相反的两个方向伸展。',
  'guide.diverging_bar.purpose': '它用来比较对立的两方，比如同意和不同意的回答，或人口金字塔里的男性和女性。',
  'guide.diverging_bar.appearance': '中间竖着一条线。每个类别有一根长条向左伸，另一根向右伸。长条的长度就是它的数值，伸向哪一边说明它属于哪一组。',

  'guide.dodged_bar.definition': '分组条形图在每个类别里并排放几根长条。',
  'guide.dodged_bar.purpose': '它用来比较每个类别里的小组，比如每个月里几种产品各自的销售额。',
  'guide.dodged_bar.appearance': '沿着类别坐标轴，排着一小簇一小簇的长条。每簇里每个小组各有一根长条，从同一条底线出发，紧挨着站在一起，通常颜色各不相同。',

  'guide.dot.definition': '点图用一个圆点表示每个类别的一个数值。',
  'guide.dot.purpose': '它和条形图的用法一样，用来比较不同类别的数值。但它画得更简洁，类别很多时也容易看清。',
  'guide.dot.appearance': '类别沿着一条坐标轴排开。每个类别在另一条坐标轴上对应数值的位置放一个圆点。',

  'guide.dumbbell.definition': '哑铃图为每个类别展示两个数值，中间用一条线连起来。',
  'guide.dumbbell.purpose': '它用来展示两个数值之间的差距或变化，比如前后对比，或今年和去年的对比。',
  'guide.dumbbell.appearance': '每个类别有两个圆点，中间由一根直杆相连，看起来就像健身房里的哑铃。直杆的长度就是差距的大小。',

  'guide.error_bar.definition': '误差条图在展示数值的同时，也展示每个数值有多不确定。',
  'guide.error_bar.purpose': '它用在科学和统计中，展示一个测量结果以及它可能的范围，比如置信区间。',
  'guide.error_bar.appearance': '每个数值是一个圆点，或一根长条的顶端。一条细线穿过它，从下限延伸到上限，两端常常有短短的横杠，看起来像字母 I。',

  'guide.forest.definition': '森林图把研究同一个问题的几项研究结果放在一起，每项研究占一行，最后再加上一个综合结果。',
  'guide.forest.purpose': '它用在医学研究和荟萃分析中，用来看各项研究的结论是否一致，以及合在一起的效果是多少。',
  'guide.forest.appearance': '各项研究从上到下排列。每项研究在它的估计值处有一个小方块，还有一条横线表示它的不确定范围。一条竖线标出“没有效果”的位置。最下面有一个菱形，代表合并后的结果。',

  'guide.gantt.definition': '甘特图把任务画成沿时间轴排列的长条。',
  'guide.gantt.purpose': '它用在项目计划中，用来看每项任务什么时候开始、什么时候结束、要花多久，以及哪些任务时间重叠。',
  'guide.gantt.appearance': '时间从左往右走，任务从上往下排。每项任务是一根横向长条，从开始日期起，到结束日期止。',

  'guide.funnel.definition': '漏斗图展示一个流程的每个阶段还剩下多少。',
  'guide.funnel.purpose': '它用来找出在哪一步流失了，比如有多少网站访客接着注册，又有多少人最后购买。',
  'guide.funnel.appearance': '各个阶段从上往下叠放。每个阶段是一根居中的长条，越往下越窄，整体形状就像厨房里用的漏斗。',

  'guide.gauge.definition': '仪表盘把一个数值放在它可能的范围里展示，就像汽车的速度表。',
  'guide.gauge.purpose': '它用来展示离目标还有多远，或者一个读数处在正常、警告还是危险区。',
  'guide.gauge.appearance': '一个半圆或一根直条代表从最小值到最大值的整个范围，常常分成几个颜色区。一根指针或一段填充部分指向当前数值，有时还有一个标记表示目标。',

  'guide.heat.definition': '热力图是由很多小格子组成的网格，每个格子按它的数值涂上深浅不同的颜色。',
  'guide.heat.purpose': '它用来在一张数字表里发现规律，比如一周里哪几天的哪些时段最忙。',
  'guide.heat.appearance': '行和列组成一个网格，就像一张棋盘。每个格子涂上一种颜色，数值越高，颜色通常越深或越暖。旁边有图例说明颜色代表的范围。',

  'guide.hexbin.definition': '六边形分箱图把散点图分成一个个六边形格子，数一数每个格子里有多少个点。',
  'guide.hexbin.purpose': '当点多到互相堆叠时，就用它来展示点最密集的地方。',
  'guide.hexbin.appearance': '绘图区域铺满了六边形，就像蜂巢一样。每个六边形按它包含的点数涂色，点越多，颜色越深。',

  'guide.hist.definition': '直方图把一组数字分成几个区间，数一数每个区间里有多少个，以此展示这组数字的分布。',
  'guide.hist.purpose': '它用来看数据的形状：大多数数值在哪里，分散得有多开，数据是否偏向一边。',
  'guide.hist.appearance': '一根根竖直的长条并排站着，中间没有空隙。每根长条覆盖底部坐标轴上的一段数值范围，它的高度就是落在这段范围里的数值个数。',

  'guide.line.definition': '折线图用一条线把一系列数值连起来，通常按时间顺序排列。',
  'guide.line.purpose': '它用来展示趋势，比如气温或股价在几天或几年里的变化。',
  'guide.line.appearance': '时间或其他有先后顺序的数值从左往右排。数值上升时线往上走，下降时线往下走。一张图里可以有好几条线，每条线代表一个系列。',

  'guide.lollipop.definition': '棒棒糖图用一根细棍加顶端一个圆点来表示每个类别的一个数值。',
  'guide.lollipop.purpose': '它和条形图的用法一样，用来比较不同类别的数值，只是看起来更轻巧。',
  'guide.lollipop.appearance': '每个类别从同一条底线升起一根细线，在它的数值处以一个圆点结尾，就像一根插在棍子上的棒棒糖。',

  'guide.manhattan.definition': '曼哈顿图展示对基因组上很多位置逐一检测的结果，每个位置一个圆点。',
  'guide.manhattan.purpose': '它用在遗传学中，用来找出和某种性状或疾病关系密切的少数几个位置。',
  'guide.manhattan.appearance': '位置从左往右排，按染色体分组，相邻的组颜色交替。高度表示信号有多强。大多数点都很低，只有少数几处像高塔一样耸立，就像纽约曼哈顿天际线上的摩天大楼。',

  'guide.mosaic.definition': '马赛克图展示两种分类怎样组合，每种组合是一块瓷砖，面积和它所占的比例一致。',
  'guide.mosaic.purpose': '它用来探索一张计数表里的关系，比如不同舱位乘客的生还情况。',
  'guide.mosaic.appearance': '一个长方形先被切成几列，每列的宽度和每组的大小一致。每一列再从上到下切成几块，每块的高度和每个小组所占的比例一致。',

  'guide.network.definition': '网络图把事物画成点，把它们之间的联系画成线。',
  'guide.network.purpose': '它用来展示关系，比如人和人之间的朋友关系，或网页之间的链接，也用来找出联系最多的事物。',
  'guide.network.appearance': '页面上散布着一个个小圆圈，叫作节点。线条把两两节点连起来，这些线叫作连线。联系多的事物往往在中间，许多线从它们身上向外伸出。',

  'guide.stacked_normalized_bar.definition': '百分比堆叠条形图让每个类别的长条总长度都一样，再把长条按百分比分成几段。',
  'guide.stacked_normalized_bar.purpose': '它用来比较不同类别的比例，比如几个国家里各年龄段人口所占的比例。',
  'guide.stacked_normalized_bar.appearance': '每根长条都一样长，代表百分之百。每根长条被分成几段不同颜色的部分，首尾相接。每一段的大小就是那部分所占的比例。',

  'guide.stacked_normalized_area.definition': '百分比堆叠面积图展示一个整体里几个部分的比例随时间怎样变化。',
  'guide.stacked_normalized_area.purpose': '它用来跟踪比例随时间的变化，比如每年各种能源来源所占的比例。',
  'guide.stacked_normalized_area.appearance': '整张图是一个从 0 到 100% 的完整长方形。几条彩色的带子一层层叠起来，总是把它填满。某部分的比例变大时，它的带子变粗；比例变小时，带子变细。',

  'guide.parallel_coordinates.definition': '平行坐标图展示有很多项测量值的事物，每个事物一条线。',
  'guide.parallel_coordinates.purpose': '它用来同时在很多个变量上比较事物，并找出相似的事物组成的群体。',
  'guide.parallel_coordinates.appearance': '几条竖直的坐标轴并排站着，每条代表一项测量。每个事物是一条折来折去的线，在每条坐标轴上穿过它在这项测量上的数值。',

  'guide.pie.definition': '饼图把一个圆切成几块，展示一个整体怎样分成几个部分。',
  'guide.pie.purpose': '它用来展示各部分占总数的份额，比如一笔预算怎样分给各个部门。',
  'guide.pie.appearance': '一个圆从圆心切成几块扇形，就像切开的比萨饼。份额越大，扇形越宽，所有扇形合起来正好是一整个圆。',

  'guide.polar_area.definition': '极区图，也叫玫瑰图，用角度相同、向外伸出长短不一的扇形来表示数值。',
  'guide.polar_area.purpose': '它用来比较循环类别的数值，比如一年中的各个月份，或罗盘上的各个方向。',
  'guide.polar_area.appearance': '扇形从同一个中心向外展开，角度都一样，就像花的花瓣。扇形伸得离中心越远，数值越大。',

  'guide.radar.definition': '雷达图，也叫蜘蛛网图，把一个事物的几项测量值放在围成一圈的坐标轴上。',
  'guide.radar.purpose': '它用来比较几种能力的长处和短处，比如一名运动员的各项技能。',
  'guide.radar.appearance': '从中心点向外伸出几根辐条，每项测量一根，就像车轮的辐条。每个数值是它那根辐条上的一个点，数值越高离中心越远。这些点连成一个闭合的形状，就像一张蜘蛛网。',

  'guide.ridgeline.definition': '山脊图把几组数据的分布画成平滑的曲线，一条叠在另一条上面。',
  'guide.ridgeline.purpose': '它用来比较很多组数据的形状，比如每个月的气温分布。',
  'guide.ridgeline.appearance': '每组数据有一条像小山一样的曲线，数值常见的地方就高。这些曲线从上往下排，彼此稍微重叠，就像远远望去的一道道山脊。',

  'guide.roc.definition': 'ROC 曲线展示一项检测或一个预测模型区分两种结果的能力有多好，比如区分生病和健康。',
  'guide.roc.purpose': '它用来评判一个分类模型，并选出一个合适的判断标准，在抓住真正的病例和避免误报之间取得平衡。',
  'guide.roc.appearance': '在一个正方形里，一条曲线从左下角爬到右上角。一条对角线代表随便乱猜。曲线越往左上角弯，模型就越好。',

  'guide.rug.definition': '地毯图把每个观测值画成坐标轴旁边的一条短刻度线。',
  'guide.rug.purpose': '它用来准确地展示每个数值落在哪里、在哪里扎堆，常常和别的图表放在一起。',
  'guide.rug.appearance': '图表的一条边上有一排短线，就像地毯边上的流苏。每条短线是一个数值，密集的地方看起来像一丛浓密的刷毛。',

  'guide.sankey.definition': '桑基图展示一个数量怎样从一组阶段流向下一组阶段。',
  'guide.sankey.purpose': '它用来追踪东西从哪里来、到哪里去，比如能源从来源到用途的流向，或资金在预算里的流向。',
  'guide.sankey.appearance': '一个个方块叫作节点，从左到右排成几列。带子从一个节点流向另一个节点，带子的宽度表示流过的量有多少。',

  'guide.point.definition': '散点图展示两个数值之间的关系，每个事物一个圆点。',
  'guide.point.purpose': '它用来看两项指标是否相关，比如身高和体重，也用来发现成群的点和不寻常的点。',
  'guide.point.appearance': '圆点散布在一块平面上。每个圆点的左右位置是一个数值，上下位置是另一个数值。如果圆点排成一条向上斜的带子，说明这两个数值往往一起增长。',

  'guide.smooth.definition': '平滑曲线图是穿过数据点拟合出的一条曲线，用来展示数据的总体趋势。',
  'guide.smooth.purpose': '它用来看杂乱数据的总体走向，不被每一次小的起伏干扰。',
  'guide.smooth.appearance': '一条平缓的曲线从左往右穿过数据的中间。它不会碰到每一个点，常常画在散点图上面，有时周围还有一条带阴影的区域。',

  'guide.sunflower.definition': '向日葵图是一种散点图，同一位置上重复的点会画成一个带花瓣的标记。',
  'guide.sunflower.purpose': '当很多观测值的数值完全相同时，用它可以让每个位置上的数量不被遮住。',
  'guide.sunflower.appearance': '它看起来像散点图，但有些圆点向外伸出几条短线，就像花的花瓣。花瓣的数目就是那个位置上观测值的个数。',

  'guide.stacked_bar.definition': '堆叠条形图把每个类别画成一根长条，长条由几个部分一层层叠起来。',
  'guide.stacked_bar.purpose': '它既能展示每个类别的总数，又能展示总数由哪些部分组成，比如按产品拆分的总销售额。',
  'guide.stacked_bar.appearance': '长条并排站着。每根长条分成几段不同颜色的部分，一段叠在另一段上面。长条的总高度是总数，每一段是其中一个部分。',

  'guide.stacked_area.definition': '堆叠面积图把几个数量随时间的变化一层层叠在一起展示。',
  'guide.stacked_area.purpose': '它用来展示总数随时间怎样变化，以及每个部分对总数贡献了多少。',
  'guide.stacked_area.appearance': '几条彩色的带子从下往上一层层叠起来，每条都搭在下面那条上。最上面那条带子的上边缘是总数，每条带子的厚度就是那部分的数量。',

  'guide.step.definition': '阶梯图是一种折线图，线条一级一级地平着走，而不是斜着走。',
  'guide.step.purpose': '它用于那种保持一段时间不变、然后突然跳变的数值，比如价格、利率或计数。',
  'guide.step.appearance': '线先平着走，然后直直地向上或向下，再接着平着走，就像从侧面看到的楼梯。',

  'guide.survival.definition': '生存曲线展示随着时间推移，一群人中还没有发生某件事的人所占的比例。',
  'guide.survival.purpose': '它用在医学和工程中，用来比较人或机器能坚持多久，比如接受两种不同治疗的病人。',
  'guide.survival.appearance': '线从左上角的 100% 开始，每发生一次事件，就向右下方降一级台阶。曲线在高处停留得越久，说明生存情况越好。线上可能有小刻度，表示中途退出研究的人。',

  'guide.icicle.definition': '冰柱图把一个层级结构画成一层层的长方形，比如文件夹和文件。',
  'guide.icicle.purpose': '它用来看一个整体怎样分成几个部分，这些部分又怎样再分成更小的部分。',
  'guide.icicle.appearance': '整体是顶部一根长长的横条。它下面被分成下一层的各个部分，每个部分下面又再分，就像屋檐下挂着的冰柱。越宽的块越大。',

  'guide.sunburst.definition': '旭日图把一个层级结构画成围绕中心的一圈圈圆环。',
  'guide.sunburst.purpose': '它用来看一个整体在几个层级上怎样分成几个部分，比如一家公司的预算按部门和团队怎样分配。',
  'guide.sunburst.appearance': '中心的圆代表整体。往外每一圈是下一层，被切成一段段弧形。每段弧形紧贴在它上一层那段的外面，弧形越宽，份额越大。',

  'guide.tree.definition': '树形图用线把一个个方框连起来，展示从一个根到各个分支的层级结构。',
  'guide.tree.purpose': '它用来展示结构，比如公司的组织架构图、家谱，或一连串的决策。',
  'guide.tree.appearance': '一个事物在最上面或最左边。线从它分出去，连到它的下一级，下一级又再分出去，就像一棵倒过来的树。',

  'guide.pack.definition': '圆形打包图用一个套一个的圆圈来展示层级结构。',
  'guide.pack.purpose': '它用来展示大组里的小组以及它们的大小，比如各大洲里的国家。',
  'guide.pack.appearance': '一个大圆里装着几个小圆，小圆里可能还装着更小的圆，就像泡泡里套着泡泡。每个圆的大小表示它的数值。',

  'guide.treemap.definition': '矩形树图用一个套一个的长方形来展示层级结构，每个长方形的面积和它的数值一致。',
  'guide.treemap.purpose': '它用来看一个整体里哪些部分最大，比如哪些文件夹占用的磁盘空间最多。',
  'guide.treemap.appearance': '一个大长方形被铺满了小长方形，就像一床百衲被。数值越大，小块越大。属于同一组的小块挨在一起，放在一个更大的块里面。',

  'guide.violin_box.definition': '小提琴箱线图是画在小提琴图里面的箱线图，用五个数概括每一组数据。',
  'guide.violin_box.purpose': '它用来在看小提琴形状的同时，读出每一组的最小值、下四分位数、中位数、上四分位数和最大值。',
  'guide.violin_box.appearance': '每个小提琴形状里有一个窄窄的箱子，中位数处有一个标记，细细的须线向上下伸到最小值和最大值。',

  'guide.violin_kde.definition': '小提琴图用一个平滑、左右对称的轮廓来展示一组数据的形状。',
  'guide.violin_kde.purpose': '它用来比较几组数据的分布，看出哪里的数值常见，哪里的数值少见。',
  'guide.violin_kde.appearance': '每一组有一个形状，数值多的地方宽，数值少的地方窄。这个形状沿中线左右对称，看起来常常像一把小提琴或一只花瓶。',

  'guide.volcano.definition': '火山图同时展示很多个事物的变化有多大，以及这种变化在统计上有多显著。',
  'guide.volcano.purpose': '它用在生物学中，用来挑出在两种条件之间变化又大又可靠的基因或蛋白质。',
  'guide.volcano.appearance': '圆点组成一个像火山喷发的形状。左右位置表示变化的大小和方向，高度表示显著程度。值得关注的事物在左上角和右上角。',

  'guide.waterfall.definition': '瀑布图展示一个起始值经过一连串增加和减少，最后得到一个最终值的过程。',
  'guide.waterfall.purpose': '它用来一步一步地解释一个总数，比如收入和成本怎样加减得出利润。',
  'guide.waterfall.appearance': '第一根长条立在底线上。后面的每根长条都悬在空中，从上一根结束的地方开始，增加就往上，减少就往下，像一级级台阶。最后一根长条又立回底线上，表示最终的总数。',

  'guide.word_cloud.definition': '词云展示一段文字里的词语，出现越多或越重要的词画得越大。',
  'guide.word_cloud.purpose': '它用来快速了解一段文字、一批问卷回答或一些社交媒体帖子的主要话题。',
  'guide.word_cloud.appearance': '词语挤在一起组成一团，大小各不相同，有时方向也不一样。最大的词就是最常见的词。',
} satisfies Partial<Record<MessageKey, string>>;
