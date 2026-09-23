/**
 * Messages of the chart description: the labels and values the description
 * service puts in a description, and the chrome of the dialog that shows it.
 */
export const description = {
  // Stat labels and values built by DescriptionService.
  'description.statOrientation': 'Orientation',
  'description.statSubtitle': 'Subtitle',
  'description.statCaption': 'Caption',
  'description.statCurrentlyOn': 'Currently on',
  'description.statChartTypes': 'Chart types',
  'description.multiPanelFigure': 'Multi-panel figure',
  'description.valueInfinity': 'infinity',
  'description.valueNegativeInfinity': 'negative infinity',
  'description.subplotPosition': 'subplot {index} of {total}',
  'description.chartTypeCount': '{kind} ({count})',

  // Dialog chrome.
  'description.title': 'Chart Description',
  'description.close': 'Close',
  'description.chartTypePrefix': 'Chart Type: ',
  'description.titleLabel': 'Title',
  'description.titleLabelSubplot': 'Subplot title',
  'description.titleLabelFigure': 'Figure title',
  'description.axesHeading': 'Axes',
  'description.axisEntry': '{axis} axis: {label}',
  'description.summaryHeading': 'Summary',
  'description.subplotsHeading': 'Subplots ({count})',
  'description.subplotUnknown': 'unknown',
  'description.subplotCurrent': ' (current)',

  // Layer tab strip.
  'description.layersHeading': 'Layers ({count})',
  'description.showingLayer': 'Showing layer {index} of {total}',
  'description.layerHint': 'Use the left and right arrow keys to move between layers and Space to open one.',
  'description.layerUpdated': 'Description updated for layer {index} of {total}',

  // Data table. `row` and `rows` are separate keys because the caller picks
  // the one the count calls for; there is no plural engine.
  'description.rowOne': 'row',
  'description.rowMany': 'rows',
  'description.tableCaption': 'Data: {total} {rows}',
  'description.tableCaptionTruncated': 'Data: showing {shown} of {total} {rows}',
  'description.tableShowMore': 'Show {count} more of {total} {rows}',
  'description.tableColumn': 'Column {index}',

  // The chart type guide: the collapsible section that says, in plain words,
  // what kind of chart is being described -- what it is, what it is used for
  // and what it looks like. Keys are `guide.<trace type>.<part>`, built from
  // the `TraceType` value, so a type added without a guide fails the type
  // check in `chartGuide`.
  'guide.toggle': 'About this chart type ({chartType})',
  'guide.definitionHeading': 'What it is',
  'guide.purposeHeading': 'What it is used for',
  'guide.appearanceHeading': 'What it looks like',

  // Multi-panel figure (the lobby, before a subplot is entered).
  'guide.figure.definition': 'A multi-panel figure is several small charts placed side by side or in a grid, sharing one overall title.',
  'guide.figure.purpose': 'It is used to compare related views of data at a glance, such as the same measure for different groups or years.',
  'guide.figure.appearance': 'Picture a page divided into boxes like a window with several panes. Each box holds its own chart with its own axes, and you can enter one panel at a time.',

  'guide.area.definition': 'An area chart is a line chart with the space between the line and the bottom axis filled in.',
  'guide.area.purpose': 'It is used to show how an amount rises and falls over time, and to make the total size of that amount easy to feel.',
  'guide.area.appearance': 'A line runs from left to right, going up and down with the values. Everything below the line, down to the baseline, is filled in, so it looks like a mountain range seen from the side.',

  'guide.alluvial.definition': 'An alluvial diagram shows how items move between groups across several steps.',
  'guide.alluvial.purpose': 'It is used to follow changes in group membership, such as how voters moved between parties from one election to the next.',
  'guide.alluvial.appearance': 'Columns of stacked blocks stand in a row from left to right, one column per step. Curved bands flow between neighbouring columns, and a thicker band means more items took that path.',

  'guide.bar.definition': 'A bar chart shows one number for each category as a bar.',
  'guide.bar.purpose': 'It is used to compare amounts between categories, such as sales by month or votes by candidate.',
  'guide.bar.appearance': 'Rectangles of the same width stand side by side, starting from a common baseline. The longer the bar, the bigger the value. Bars can stand upright or lie on their side.',

  'guide.bump.definition': 'A bump chart shows how the rank of several competitors changes over time.',
  'guide.bump.purpose': 'It is used to follow who is first, second, third and so on, and to spot when one overtakes another, such as teams in a league table.',
  'guide.bump.appearance': 'Time runs from left to right and rank runs from top to bottom, with first place at the top. Each competitor is a line with a dot at each time step, and lines cross where positions swap.',

  'guide.box.definition': 'A box plot summarises a set of numbers with five values: the lowest, the lower quarter, the middle, the upper quarter, and the highest.',
  'guide.box.purpose': 'It is used to compare the spread and centre of several groups, and to spot unusual values called outliers.',
  'guide.box.appearance': 'Each group has a box with a line across it at the middle value. Thin lines called whiskers stretch out from both ends of the box to the lowest and highest typical values. Outliers are small dots beyond the whiskers.',

  'guide.boxen.definition': 'A letter-value plot is an extended box plot that shows more cut points of the data, especially in the tails.',
  'guide.boxen.purpose': 'It is used for large data sets, where an ordinary box plot hides too much detail about the extreme values.',
  'guide.boxen.appearance': 'Each group looks like a stack of boxes centred on the middle value. The widest box holds the middle half of the data, and each smaller box further out holds a thinner slice of the tails, like a stepped pyramid.',

  'guide.candlestick.definition': 'A candlestick chart shows how a price moved during each time period, such as a day.',
  'guide.candlestick.purpose': 'It is used in finance to read the opening, highest, lowest and closing price of a stock or currency for each period.',
  'guide.candlestick.appearance': 'Time runs from left to right, with one candle per period. Each candle is a thick body between the opening and closing price, with thin lines called wicks reaching up to the high and down to the low. The body is usually one colour when the price went up and another when it went down.',

  'guide.candlestick_delta.definition': 'A candlestick reference delta compares each candle of a candlestick chart with a reference line, such as a moving average.',
  'guide.candlestick_delta.purpose': 'It is used to tell how far above or below its usual level the price was in each period.',
  'guide.candlestick_delta.appearance': 'It is not drawn separately. It reads the same candles as the candlestick chart, and reports each price as a difference from the reference line at that point in time.',

  'guide.chord.definition': 'A chord diagram shows flows or connections between members of one group, arranged around a circle.',
  'guide.chord.purpose': 'It is used to show who exchanges how much with whom, such as trade between countries or migration between regions.',
  'guide.chord.appearance': 'Members sit as arcs around the edge of a circle. Curved ribbons cross the inside of the circle to join two members, and a wider ribbon means a bigger flow.',

  'guide.choropleth.definition': 'A choropleth map is a map where each region is shaded according to a value.',
  'guide.choropleth.purpose': 'It is used to show how a measure varies from place to place, such as population by country or income by county.',
  'guide.choropleth.appearance': 'It looks like an ordinary map with borders around regions such as countries or states. Each region is filled with a shade, usually darker or more intense for higher values, with a legend explaining the scale.',

  'guide.contour.definition': 'A contour plot shows a surface of values on flat paper using lines that join points of equal value.',
  'guide.contour.purpose': 'It is used for data that varies over two dimensions, such as height on a hiking map or temperature across a region.',
  'guide.contour.appearance': 'Closed, wavy rings are drawn one inside another, like the rings on a hiking map around a hill. Each ring marks one value. Where the rings are close together the value changes steeply, and where they are far apart it changes gently.',

  'guide.diverging_bar.definition': 'A diverging bar chart shows bars growing in two opposite directions from a central line.',
  'guide.diverging_bar.purpose': 'It is used to compare two opposing sides, such as agree versus disagree answers, or men versus women in a population pyramid.',
  'guide.diverging_bar.appearance': 'A line runs down the middle. For each category, one bar extends to the left and another to the right. The length of each bar is its value, and the side tells you which group it belongs to.',

  'guide.dodged_bar.definition': 'A dodged bar chart, also called a grouped bar chart, places several bars side by side within each category.',
  'guide.dodged_bar.purpose': 'It is used to compare sub-groups within each category, such as sales of several products in each month.',
  'guide.dodged_bar.appearance': 'Along the category axis there are small clusters of bars. Each cluster holds one bar per sub-group, standing next to each other from the same baseline, usually in different colours.',

  'guide.dot.definition': 'A dot plot shows one number for each category as a single dot.',
  'guide.dot.purpose': 'It is used just like a bar chart, to compare values between categories, but with less ink so many categories stay easy to read.',
  'guide.dot.appearance': 'Categories are listed along one axis. For each one, a single dot is placed at the position of its value along the other axis.',

  'guide.dumbbell.definition': 'A dumbbell chart shows two values for each category, joined by a line.',
  'guide.dumbbell.purpose': 'It is used to show the gap or change between two values, such as before and after, or this year and last year.',
  'guide.dumbbell.appearance': 'Each category has two dots connected by a straight bar, so it looks like a dumbbell from a gym. The length of the bar is the size of the gap.',

  'guide.error_bar.definition': 'An error bar chart shows values together with how uncertain each value is.',
  'guide.error_bar.purpose': 'It is used in science and statistics to show a measurement and its likely range, such as a confidence interval.',
  'guide.error_bar.appearance': 'Each value is a dot or the top of a bar. A thin line runs through it, reaching from a lower limit to an upper limit, often with short crossbars at both ends like the letter I.',

  'guide.forest.definition': 'A forest plot shows the results of several studies on the same question, one row per study, plus an overall combined result.',
  'guide.forest.purpose': 'It is used in medical research and meta-analysis to see whether studies agree and what their combined effect is.',
  'guide.forest.appearance': 'Studies are listed from top to bottom. Each has a small square at its estimate and a horizontal line showing its uncertainty. A vertical line marks "no effect". At the bottom, a diamond shows the pooled result.',

  'guide.gantt.definition': 'A Gantt chart shows tasks as bars along a timeline.',
  'guide.gantt.purpose': 'It is used in project planning to see when each task starts and ends, how long it takes, and which tasks overlap.',
  'guide.gantt.appearance': 'Time runs from left to right and tasks are listed from top to bottom. Each task is a horizontal bar that begins at its start date and ends at its finish date.',

  'guide.funnel.definition': 'A funnel chart shows how many items remain at each stage of a process.',
  'guide.funnel.purpose': 'It is used to find where items drop out, such as how many website visitors go on to sign up and then to buy.',
  'guide.funnel.appearance': 'Stages are stacked from top to bottom. Each stage is a bar centred on the middle, and the bars get narrower going down, so the whole shape looks like a kitchen funnel.',

  'guide.gauge.definition': 'A gauge shows a single value against its possible range, like a speedometer.',
  'guide.gauge.purpose': 'It is used to show progress towards a goal or whether a reading is in a good, warning or bad zone.',
  'guide.gauge.appearance': 'A half circle or a straight bar represents the full range from minimum to maximum, often split into coloured zones. A needle or a filled portion points to the current value, sometimes with a marker for the target.',

  'guide.heat.definition': 'A heatmap is a grid of cells where each cell is shaded according to its value.',
  'guide.heat.purpose': 'It is used to spot patterns in a table of numbers, such as which hours of which days are busiest.',
  'guide.heat.appearance': 'Rows and columns form a grid like a chessboard. Each cell is filled with a colour, usually darker or warmer for higher values, and a legend explains the scale.',

  'guide.hexbin.definition': 'A hexbin plot divides a scatter plot into six-sided cells and counts how many points fall in each.',
  'guide.hexbin.purpose': 'It is used when there are so many points that they pile on top of each other, to show where they are most crowded.',
  'guide.hexbin.appearance': 'The plotting area is covered with hexagons like a honeycomb. Each hexagon is shaded by how many points it holds, with darker cells for more points.',

  'guide.hist.definition': 'A histogram shows how a set of numbers is distributed by counting how many fall into each range.',
  'guide.hist.purpose': 'It is used to see the shape of data: where most values are, how spread out they are, and whether the data leans to one side.',
  'guide.hist.appearance': 'Upright bars stand side by side with no gaps between them. Each bar covers a range of values along the bottom axis, and its height is how many values fall in that range.',

  'guide.line.definition': 'A line chart connects a series of values with a line, usually in time order.',
  'guide.line.purpose': 'It is used to show trends, such as how temperature or a stock price changes over days or years.',
  'guide.line.appearance': 'Time or another ordered value runs from left to right. A line goes up when values rise and down when they fall. Several lines can share the same chart, one per series.',

  'guide.lollipop.definition': 'A lollipop chart shows one number for each category as a thin stick with a dot on its end.',
  'guide.lollipop.purpose': 'It is used just like a bar chart, to compare values between categories, with a lighter look.',
  'guide.lollipop.appearance': 'From a common baseline, a thin line rises for each category and ends in a round dot at its value, like a lollipop on a stick.',

  'guide.manhattan.definition': 'A Manhattan plot shows the results of testing many positions along a genome, one dot per position.',
  'guide.manhattan.purpose': 'It is used in genetics to find the few locations that are strongly linked to a trait or disease.',
  'guide.manhattan.appearance': 'Positions run from left to right, grouped by chromosome in alternating colours. Height shows how strong the signal is. Most dots stay low, and a few towers stand up high, like skyscrapers on the Manhattan skyline.',

  'guide.mosaic.definition': 'A mosaic plot shows how two categories combine, using tiles whose area matches each combination\'s share.',
  'guide.mosaic.purpose': 'It is used to explore relationships in a table of counts, such as survival by passenger class.',
  'guide.mosaic.appearance': 'A rectangle is split into columns whose widths match the size of each group. Each column is then split from top to bottom into tiles whose heights match the share of each sub-group.',

  'guide.network.definition': 'A network diagram shows items as points and the connections between them as lines.',
  'guide.network.purpose': 'It is used to show relationships, such as friendships between people or links between web pages, and to find the most connected items.',
  'guide.network.appearance': 'Small circles called nodes are spread over the page. Lines called links join pairs of nodes. Items with many connections tend to sit in the middle with lines radiating from them.',

  'guide.stacked_normalized_bar.definition': 'A normalized stacked bar chart shows each category as a bar of the same total length, split into percentage parts.',
  'guide.stacked_normalized_bar.purpose': 'It is used to compare proportions between categories, such as the share of each age group in several countries.',
  'guide.stacked_normalized_bar.appearance': 'Every bar has the same length, standing for 100 percent. Each bar is divided into coloured segments stacked end to end, and the size of each segment is that part\'s share.',

  'guide.stacked_normalized_area.definition': 'A normalized stacked area chart shows how the shares of several parts of a whole change over time.',
  'guide.stacked_normalized_area.purpose': 'It is used to follow proportions over time, such as the share of energy from different sources each year.',
  'guide.stacked_normalized_area.appearance': 'The chart is a full rectangle from 0 to 100 percent. Coloured bands are stacked on top of each other and always fill it completely. A band gets thicker when its share grows and thinner when it shrinks.',

  'guide.parallel_coordinates.definition': 'A parallel coordinates plot shows items with many measurements, one line per item.',
  'guide.parallel_coordinates.purpose': 'It is used to compare items across many variables at once, and to find groups of similar items.',
  'guide.parallel_coordinates.appearance': 'Several vertical axes stand side by side, one per measurement. Each item is a zig-zag line that crosses every axis at its value for that measurement.',

  'guide.pie.definition': 'A pie chart shows how a whole is divided into parts, as slices of a circle.',
  'guide.pie.purpose': 'It is used to show shares of a total, such as how a budget is split between departments.',
  'guide.pie.appearance': 'A circle is cut into wedge-shaped slices from its centre, like a pie. The bigger the share, the wider the slice, and all slices together make the full circle.',

  'guide.polar_area.definition': 'A polar area chart, also called a rose chart, shows values as wedges of equal angle that stretch outwards by different amounts.',
  'guide.polar_area.purpose': 'It is used to compare values in cyclic categories, such as months of the year or compass directions.',
  'guide.polar_area.appearance': 'Wedges fan out from a common centre, all with the same angle, like petals of a flower. The further a wedge reaches from the centre, the larger its value.',

  'guide.radar.definition': 'A radar chart, also called a spider chart, shows several measurements of one item on axes arranged in a circle.',
  'guide.radar.purpose': 'It is used to compare strengths and weaknesses across several qualities, such as the skills of a player.',
  'guide.radar.appearance': 'Spokes radiate from a centre point, one per measurement, like the spokes of a wheel. Each value is a point on its spoke, further out for higher values, and the points are joined into a closed shape like a spider web.',

  'guide.ridgeline.definition': 'A ridgeline plot shows the distribution of several groups as smooth curves stacked one above another.',
  'guide.ridgeline.purpose': 'It is used to compare the shape of data across many groups, such as temperatures in each month.',
  'guide.ridgeline.appearance': 'Each group has a hill-shaped curve that is higher where values are common. The curves are stacked down the page, slightly overlapping, like a row of mountain ridges seen from a distance.',

  'guide.roc.definition': 'A ROC curve shows how well a test or prediction model separates two outcomes, such as sick and healthy.',
  'guide.roc.purpose': 'It is used to judge a classifier and choose a threshold that balances catching true cases against raising false alarms.',
  'guide.roc.appearance': 'A curve climbs from the bottom-left corner to the top-right corner of a square. A diagonal line marks random guessing. The closer the curve bends towards the top-left corner, the better the model.',

  'guide.rug.definition': 'A rug plot marks each observation as a short tick along an axis.',
  'guide.rug.purpose': 'It is used to show exactly where individual values fall and where they bunch together, often alongside another chart.',
  'guide.rug.appearance': 'Along one edge of the chart there is a row of short lines, like the fringe of a rug. Each line is one value, and dense areas look like thick bristles.',

  'guide.sankey.definition': 'A Sankey diagram shows how an amount flows from one set of stages to the next.',
  'guide.sankey.purpose': 'It is used to trace where things come from and where they go, such as energy from sources to uses, or money through a budget.',
  'guide.sankey.appearance': 'Blocks called nodes stand in columns from left to right. Bands flow from one node to another, and the width of each band shows how much flows along it.',

  'guide.point.definition': 'A scatter plot shows the relationship between two numbers, with one dot for each item.',
  'guide.point.purpose': 'It is used to see whether two measures are related, such as height and weight, and to spot clusters and unusual points.',
  'guide.point.appearance': 'Dots are spread across a flat area. Each dot\'s left-right position is one value and its up-down position is the other. If the dots form a rising band, the two values tend to grow together.',

  'guide.smooth.definition': 'A smooth line is a curve fitted through data points to show their general trend.',
  'guide.smooth.purpose': 'It is used to see the overall direction of noisy data without being distracted by every up and down.',
  'guide.smooth.appearance': 'A single gentle curve runs from left to right through the middle of the data. It does not touch every point, and it is often drawn on top of a scatter plot, sometimes with a shaded band around it.',

  'guide.sunflower.definition': 'A sunflower plot is a scatter plot where repeated points at the same spot are drawn as one mark with petals.',
  'guide.sunflower.purpose': 'It is used when many observations share exactly the same values, so that the number at each spot is not hidden.',
  'guide.sunflower.appearance': 'It looks like a scatter plot, but some dots have short lines sticking out of them like the petals of a flower. The number of petals is the number of observations at that spot.',

  'guide.stacked_bar.definition': 'A stacked bar chart shows each category as one bar made of several parts stacked on top of each other.',
  'guide.stacked_bar.purpose': 'It is used to show both the total for each category and how that total is made up, such as total sales split by product.',
  'guide.stacked_bar.appearance': 'Bars stand side by side. Each bar is divided into coloured segments placed one on top of the other. The full height of the bar is the total, and each segment is one part.',

  'guide.stacked_area.definition': 'A stacked area chart shows several amounts over time, piled on top of each other.',
  'guide.stacked_area.purpose': 'It is used to show how a total changes over time and how each part contributes to it.',
  'guide.stacked_area.appearance': 'Coloured bands are layered from the bottom up, each resting on the one below. The top edge of the highest band is the total, and the thickness of each band is that part\'s amount.',

  'guide.step.definition': 'A step plot is a line chart that moves in flat steps instead of sloping lines.',
  'guide.step.purpose': 'It is used for values that stay the same for a while and then jump, such as prices, interest rates or counts.',
  'guide.step.appearance': 'The line runs flat, then goes straight up or down, then runs flat again, like a staircase seen from the side.',

  'guide.survival.definition': 'A survival curve shows the share of a group that has not yet experienced an event, as time passes.',
  'guide.survival.purpose': 'It is used in medicine and engineering to compare how long people or machines last, such as patients on two treatments.',
  'guide.survival.appearance': 'The line starts at the top-left at 100 percent and steps down to the right each time an event happens. A curve that stays higher for longer means better survival. Small tick marks may show people who left the study.',

  'guide.icicle.definition': 'An icicle chart shows a hierarchy, such as folders and files, as layers of rectangles.',
  'guide.icicle.purpose': 'It is used to see how a whole is broken down into parts, and those parts into smaller parts.',
  'guide.icicle.appearance': 'The whole is a long bar along the top. Underneath, it is split into the next level\'s parts, and each of those is split again below, like icicles hanging from a roof. Wider pieces are bigger.',

  'guide.sunburst.definition': 'A sunburst chart shows a hierarchy as rings around a centre.',
  'guide.sunburst.purpose': 'It is used to see how a whole divides into parts at several levels, such as a company\'s budget by department and team.',
  'guide.sunburst.appearance': 'The centre circle is the whole. Each ring outward is the next level down, cut into arcs. Each arc sits directly outside its parent, and wider arcs are bigger shares.',

  'guide.tree.definition': 'A tree diagram shows a hierarchy as boxes joined by lines, from one root to its branches.',
  'guide.tree.purpose': 'It is used to show structure, such as an organisation chart, a family tree, or a set of decisions.',
  'guide.tree.appearance': 'One item sits at the top or left. Lines branch out from it to its children, which branch out again to theirs, like an upside-down tree.',

  'guide.pack.definition': 'A circle packing chart shows a hierarchy as circles nested inside other circles.',
  'guide.pack.purpose': 'It is used to show groups within groups and their sizes, such as countries within continents.',
  'guide.pack.appearance': 'One large circle holds smaller circles, which may hold even smaller circles, like bubbles inside bubbles. The size of each circle shows its value.',

  'guide.treemap.definition': 'A treemap shows a hierarchy as nested rectangles, where each rectangle\'s area matches its value.',
  'guide.treemap.purpose': 'It is used to see which parts of a whole are biggest, such as which folders take up the most disk space.',
  'guide.treemap.appearance': 'A large rectangle is tiled with smaller rectangles, like a patchwork quilt. Bigger values get bigger tiles, and tiles belonging to the same group sit together inside a larger tile.',

  'guide.violin_box.definition': 'A violin box plot is the box plot drawn inside a violin plot, summarising each group with five values.',
  'guide.violin_box.purpose': 'It is used to read the lowest, lower quarter, middle, upper quarter and highest values of each group alongside the violin\'s shape.',
  'guide.violin_box.appearance': 'Inside each violin shape sits a narrow box with a mark at the middle value and thin whiskers stretching up and down to the lowest and highest values.',

  'guide.violin_kde.definition': 'A violin plot shows the shape of a group\'s data as a smooth, mirrored outline.',
  'guide.violin_kde.purpose': 'It is used to compare distributions of several groups, showing where values are common and where they are rare.',
  'guide.violin_kde.appearance': 'Each group has a shape that is wide where many values sit and narrow where few do. The shape is mirrored on both sides of a centre line, so it often looks like a violin or a vase.',

  'guide.volcano.definition': 'A volcano plot shows, for many items at once, how big a change is and how statistically significant it is.',
  'guide.volcano.purpose': 'It is used in biology to pick out genes or proteins that change strongly and reliably between two conditions.',
  'guide.volcano.appearance': 'Dots form a shape like an erupting volcano. Left-right position is the size and direction of the change, and height is the significance. The interesting items are in the upper-left and upper-right corners.',

  'guide.waterfall.definition': 'A waterfall chart shows how a starting value is changed by a series of increases and decreases to reach a final value.',
  'guide.waterfall.purpose': 'It is used to explain a total step by step, such as how revenue and costs add up to profit.',
  'guide.waterfall.appearance': 'The first bar stands on the baseline. Each following bar floats, starting where the previous one ended, going up for an increase or down for a decrease, like steps. The last bar stands on the baseline again and shows the final total.',

  'guide.word_cloud.definition': 'A word cloud shows words from a text, with more frequent or important words drawn larger.',
  'guide.word_cloud.purpose': 'It is used to get a quick sense of the main topics in a text, survey answers, or social media posts.',
  'guide.word_cloud.appearance': 'Words are packed together in a cluster, in different sizes and sometimes different directions. The biggest words are the most common.',
} as const;
