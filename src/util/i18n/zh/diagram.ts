import type { MessageKey } from '../index';

/** Chinese renderings of the diagrams MAIDR names and explains. */
export const diagram = {
  'diagram.flowchart.name': '流程图',
  'diagram.flowchart.definition': '流程图用箭头相连的图形，按发生的先后顺序展示一个过程的各个步骤。',
  'diagram.flowchart.purpose': '它用于展示一个过程如何从头走到尾，例如处理一份订单，包括把过程引向不同方向的判断，以及过程退回的步骤。',
  'diagram.flowchart.appearance': '每个步骤是一个方框或其他形状，例如判断用菱形表示。箭头从一个步骤指向下一个步骤，通常从上到下或从左到右；箭头上可能标有走这条路的答案，例如“是”或“否”。相关的步骤可以画在一个叫作子图的大方框里。',

  'diagram.swimlane.name': '泳道图',
  'diagram.swimlane.definition': '泳道图是一种流程图，它把步骤分到若干泳道中，执行这些步骤的每个人、团队或系统各占一条泳道。',
  'diagram.swimlane.purpose': '它用于展示一个过程中谁做什么，以及工作在哪里从一方交给另一方。',
  'diagram.swimlane.appearance': '一条条叫作泳道的长条横贯页面或纵向并排，每条都标明属于谁。每个步骤是所在泳道里的一个方框，箭头从一个步骤指向下一个步骤，每次交接时都从一条泳道跨到另一条泳道。',

  'diagram.agent_flow.name': '智能体流程图',
  'diagram.agent_flow.definition': '智能体流程图按先后顺序展示 AI 智能体完成一项任务所走的步骤，例如它读取的输入、执行的任务、调用的工具和做出的判断。',
  'diagram.agent_flow.purpose': '它用于设计或解释智能体如何一步步完成任务，例如审查一次代码修改，以及它的路径在哪个判断处分岔。',
  'diagram.agent_flow.appearance': '每个步骤用与其类型对应的形状画出，例如判断用菱形，并放在代表其所属流程的方框里。箭头从一个步骤指向下一个步骤，从判断引出的箭头上标有走这条路的答案。',

  'diagram.state.name': '状态图',
  'diagram.state.definition': '状态图展示某个事物可能处于的各种状态，以及让它从一个状态转到另一个状态的事件。',
  'diagram.state.purpose': '它用于描述一个系统的行为，例如可以处于空闲、播放或暂停状态的媒体播放器，以及是什么让它发生变化。',
  'diagram.state.appearance': '每个状态是一个圆角方框，状态之间的箭头上标有引起这次变化的事件。实心圆点表示起点，圆环中的圆点表示终点；一个状态还可以在自己的方框里包含更小的状态。',

  'diagram.class.name': '类图',
  'diagram.class.definition': '类图展示一个程序中的各个类，每个类包含什么、做什么，以及类与类之间的关系。',
  'diagram.class.purpose': '它用于设计或记录软件的结构，例如哪些类继承自其他类，哪些类由其他类组成。',
  'diagram.class.appearance': '每个类是一个分成三栏的方框：上栏是类名，中栏是属性，下栏是方法。有关系的类用线相连，线端的形状表示关系的种类，例如被继承的类那一端是空心三角形，持有另一个类的类那一端是菱形。',

  'diagram.entity_relationship.name': '实体关系图',
  'diagram.entity_relationship.definition': '实体关系图展示数据库所记录的各类事物（称为实体），以及它们之间的关系。',
  'diagram.entity_relationship.purpose': '它用于设计或记录数据库，例如每位顾客可以下多少份订单，每份订单包含什么。',
  'diagram.entity_relationship.appearance': '每个实体是一个以名称为标题的方框，下面常附有其属性的表格。有关系的实体用线相连，线上标有“下单”这类动词；线两端的符号表示该实体有多少个参与其中，例如恰好一个，或零个及以上。',

  'diagram.requirement.name': '需求图',
  'diagram.requirement.definition': '需求图把系统必须做到的事展示为一条条需求，并展示满足或检验这些需求的系统部分。',
  'diagram.requirement.purpose': '它用于系统工程，追踪每条需求包含哪些需求、由哪些元素满足，以及如何验证。',
  'diagram.requirement.appearance': '每条需求或每个元素是一个以类型和名称为标题的方框，列出编号（id）、文本和风险等细节。方框之间的线上标有关系，例如 contains 或 satisfies。',

  'diagram.use_case.name': '用例图',
  'diagram.use_case.definition': '用例图展示使用某个系统的人或其他系统（称为参与者），以及它们能用这个系统做什么（称为用例）。',
  'diagram.use_case.purpose': '它用于商定系统应当向谁提供什么，例如在商店里顾客和店员各自能做什么。',
  'diagram.use_case.appearance': '参与者是站在一个代表系统的大方框外面的火柴人。用例是方框里的椭圆，线把每个参与者连到它参与的用例。',

  'diagram.c4.name': 'C4 图',
  'diagram.c4_context.name': 'C4 上下文图',
  'diagram.c4_container.name': 'C4 容器图',
  'diagram.c4_component.name': 'C4 组件图',
  'diagram.c4_dynamic.name': 'C4 动态图',
  'diagram.c4_deployment.name': 'C4 部署图',
  'diagram.c4.definition': 'C4 图在一个细节层级上展示一个软件系统，例如这个系统处在周围的人和系统之中的样子，或者它内部的容器或组件，以及各部分如何相互使用。',
  'diagram.c4.purpose': '它用于按读者需要的细节程度解释一个软件架构，例如一个银行系统与哪些人和其他系统打交道。',
  'diagram.c4.appearance': '每个人、系统、容器或组件都是一个方框，标有名称、类型和简短描述；人在方框上方有一个圆形的头，数据库画成圆柱体。虚线边界把相关的部分圈在一起，它们之间的箭头上标有一方对另一方做什么以及所用的技术。',

  'diagram.block.name': '框图',
  'diagram.block.definition': '框图把一个系统的各部分展示为按行和列排列的方块，并用箭头表示它们如何连接。',
  'diagram.block.purpose': '它用于简单地概览一个系统，以及数据或控制在哪里从一个部分传到另一个部分，例如从客户端到服务器及其存储。',
  'diagram.block.appearance': '方块是放在由若干列组成的网格中的方框，大方块里可以容纳小方块。箭头连接各个方块，方块本身也可以画成一个箭头，指向某物移动的方向。',

  'diagram.architecture.name': '架构图',
  'diagram.architecture.definition': '架构图展示组成一个系统的各项服务，例如服务器、数据库和存储，以及它们之间的连接。',
  'diagram.architecture.purpose': '它用于展示一个系统（通常在云上）是如何搭建的，以及哪些服务彼此通信。',
  'diagram.architecture.appearance': '每项服务是一个图标，名称写在下面；相关的服务一起放在代表其分组的虚线框里。相连的服务之间有线，连接只朝一个方向时，线上有箭头。',

  'diagram.git_graph.name': 'Git 图',
  'diagram.git_graph.definition': 'Git 图展示一个代码仓库的历史：各次提交的先后顺序、每次提交所在的分支，以及分支在哪里分出、又在哪里合并回来。',
  'diagram.git_graph.purpose': '它用于解释一种使用分支的工作方式，例如在单独的分支上开发一个功能，再把它合并进主分支。',
  'diagram.git_graph.appearance': '每条分支是一条横贯页面的线，上下排列，开头写着分支名。提交是线上按创建顺序排列的圆点；分支开始处，线弯离出去，合并处又弯回来；标签是提交上方的文字标记。',

  'diagram.event_model.name': '事件模型',
  'diagram.event_model.definition': '事件模型展示信息如何随时间流经一个系统：用户看到的界面、用户发出的命令、这些命令记录下的事件，以及从事件读回的视图。',
  'diagram.event_model.purpose': '它用于围绕系统记录的事件来设计系统，例如商品被加入购物车，并逐步追踪从界面到命令、再到事件的每一步。',
  'diagram.event_model.appearance': '方框分布在横贯页面的泳道里：一条放界面和自动化，一条放命令和读模型，每个事件流各占一条。时间从左往右走，箭头从每个方框指向下一步。',

  'diagram.mindmap.name': '思维导图',
  'diagram.mindmap.definition': '思维导图展示从一个中心主题向外分支的各种想法，每条分支上是相关的想法。',
  'diagram.mindmap.purpose': '它用于头脑风暴、做笔记或梳理一个主题，例如让图表无障碍的各种方法。',
  'diagram.mindmap.appearance': '中心主题位于中间，常常画在一个圆里。分支从它向四面八方伸展，各自止于一个子主题，更细的分支再从每个子主题通向它下面的想法。',

  'diagram.kanban.name': '看板',
  'diagram.kanban.definition': '看板把工作展示为卡片，并把卡片分到各列中，工作的每个阶段占一列。',
  'diagram.kanban.purpose': '它用于跟踪任务的进展，例如哪些还没做、哪些正在做、哪些已完成。',
  'diagram.kanban.appearance': '各列并排而立，每列顶部写着阶段名称，下面叠放着卡片。卡片上写着任务，也可能写有工单编号、负责人和表示优先级的标记。',

  'diagram.tree_view.name': '树状视图',
  'diagram.tree_view.definition': '树状视图用缩进的列表展示层级结构，例如一个项目的文件夹和文件。',
  'diagram.tree_view.purpose': '它用于展示各项如何层层嵌套，例如哪些文件放在哪些文件夹里。',
  'diagram.tree_view.appearance': '最上层的项在第一行，每一项里面的项列在它下面，每深一层就多缩进一级。短线把每一项连到包含它的那一项。',

  'diagram.ishikawa.name': '石川图',
  'diagram.ishikawa.definition': '石川图也叫鱼骨图，它把一个问题可能的原因按类别归组展示出来。',
  'diagram.ishikawa.purpose': '它用于寻找一个问题的根本原因，例如照片模糊，方法是把所有可能的原因列在设备、流程等标题之下。',
  'diagram.ishikawa.appearance': '问题写在鱼骨架的头部，也就是一根长脊骨的一端。一根根骨头从脊骨上斜着分出，各自止于一个类别；原因从每根骨头上分出，更小的原因又从这些原因上分出。',

  'diagram.timeline.name': '时间线',
  'diagram.timeline.definition': '时间线把事件排在一条时间轴上，并按其所属的时期分组。',
  'diagram.timeline.purpose': '它用于一目了然地讲述某件事的历史，例如网页无障碍标准的里程碑。',
  'diagram.timeline.appearance': '年份等时期是从左到右排成一行的方框，位于一条表示时间的带箭头的线上方，上面还可能有分区标题把它们归组。每个时期的事件是叠放在它下面的方框。',

  'diagram.railroad.name': '铁路图',
  'diagram.railroad.definition': '铁路图也叫语法图，它把一种语法的规则展示为从起点走到终点的轨道。',
  'diagram.railroad.purpose': '它用于记录一种语言接受什么写法，例如带符号的数字可以怎样书写。',
  'diagram.railroad.appearance': '每条规则是一条从左边圆点通到右边圆点的轨道，途经代表组成该规则的词、符号和其他规则的方框。轨道分岔处，任选一条支路都可以；回绕的环表示某部分可以重复，绕过某部分的路表示这部分可以省略。',

  'diagram.cynefin.name': 'Cynefin 框架',
  'diagram.cynefin.definition': 'Cynefin 框架按因果关系能被看清的程度，把情境分为五个领域：清晰（clear）、繁杂（complicated）、复杂（complex）、混乱（chaotic），以及尚不知道属于其中哪一个时的困惑（confusion）。',
  'diagram.cynefin.purpose': '它用于决定如何应对一种情境，例如一次事故：先把它放进一个领域，再采取该领域要求的做法。',
  'diagram.cynefin.appearance': '四个领域占满一个正方形的四格：复杂在左上，繁杂在右上，混乱在左下，清晰在右下，中间的椭圆里是困惑。每个领域在标题下写出其应对方式，放在其中的项是方框，领域之间的箭头表示转变。',

  'diagram.quadrant.name': '象限图',
  'diagram.quadrant.definition': '象限图把各项放在两个尺度上，并把区域分成四块，每块有各自的含义。',
  'diagram.quadrant.purpose': '它用于按各项落在哪一块来分类或排定优先级，例如按覆盖面和参与度给推广活动分类。',
  'diagram.quadrant.appearance': '一个正方形被分成四个象限，每个象限标有其含义；一个尺度从左到右，另一个从下到上。每项是一个由两个值决定位置的圆点，旁边标有名称。',

  'diagram.user_journey.name': '用户旅程图',
  'diagram.user_journey.definition': '用户旅程图展示一个人为达成目标所经历的各项任务，以及他在每项任务上的满意程度。',
  'diagram.user_journey.purpose': '它用于找出一段体验中的好时刻和坏时刻，例如一个工作日，以便改进坏的时刻。',
  'diagram.user_journey.appearance': '任务是从左到右排成一行的方框，归在各分区标题下，每项任务上为每位参与者画一个小圆点。下面每项任务对应一张脸：得分高就画得更高、是笑脸，得分低就画得更低、是皱眉的脸。',

  'diagram.packet.name': '数据包图',
  'diagram.packet.definition': '数据包图把一个网络数据包或其他数据块的布局，展示为按顺序排列的比特字段。',
  'diagram.packet.purpose': '它用于记录一种数据格式或协议，例如 UDP 头部的哪些比特存放端口、长度和校验和。',
  'diagram.packet.appearance': '比特按固定长度（通常为 32 位）分行，每行从左到右编号。每个字段是一个与其所占比特数等宽的方框，标有名称，上方标着它的第一位和最后一位的编号。',

  'diagram.wardley_map.name': '沃德利地图',
  'diagram.wardley_map.definition': '沃德利地图把满足用户需求的各个组件放在两个尺度上：每个组件对用户有多可见，以及它演化到了什么程度，从新颖而不确定到标准而可靠。',
  'diagram.wardley_map.purpose': '它用于制定战略，例如决定哪些自己做、哪些购买，方法是看清各组件如何相互依赖、将来会怎样变化。',
  'diagram.wardley_map.appearance': '可见度从下到上，演化程度从左到右，依次经过起源（genesis）、定制（custom built）、产品（product）和商品（commodity）几个阶段。每个组件是一个标有名称的圆点，线把每个组件连到它所依赖的组件，箭头指向正在演化的组件将要去的位置。',
} satisfies Partial<Record<MessageKey, string>>;
