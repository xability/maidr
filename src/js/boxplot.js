//
// BoxPlot class.
// This initializes and contains the JSON data model for this chart
//
class BoxPlot {
  constructor() {
    constants.plotId = 0;

    constants.plotOrientation = 'horz'; // default
    if (typeof maidr !== 'undefined') {
      constants.plotOrientation = maidr.orientation;
    }

    if (
      constants.chart.querySelector(
        'g[id^="panel"] > g[id^="geom_boxplot.gTree"]'
      )
    ) {
      constants.plotId = constants.chart
        .querySelector('g[id^="panel"] > g[id^="geom_boxplot.gTree"]')
        .getAttribute('id');
    }

    if (constants.manualData) {
      // title
      let boxplotTitle = '';
      if (typeof maidr !== 'undefined' && typeof maidr.title !== 'undefined') {
        boxplotTitle = maidr.title;
      } else if (constants.chart.querySelector('tspan[dy="9.45"]')) {
        boxplotTitle =
          constants.chart.querySelector('tspan[dy="9.45"]').innerHTML;
        boxplotTitle = boxplotTitle.replace('\n', '').replace(/ +(?= )/g, ''); // there are multiple spaces and newlines, sometimes
      }
      this.title =
        typeof boxplotTitle !== 'undefined' && typeof boxplotTitle != null
          ? boxplotTitle
          : '';

      // axis labels
      if (typeof maidr !== 'undefined') {
        this.x_group_label = maidr.x_group_label;
      } else {
        this.x_group_label = constants.chart.querySelector(
          'text:not([transform^="rotate"]) > tspan[dy="7.88"]'
        ).innerHTML;
      }
      if (typeof maidr !== 'undefined') {
        this.y_group_label = maidr.y_group_label;
      } else {
        this.y_group_label = constants.chart.querySelector(
          'text[transform^="rotate"] > tspan[dy="7.88"]'
        ).innerHTML;
      }

      // x y tick labels
      let labels = [];
      if (typeof maidr !== 'undefined') {
        this.x_labels = maidr.x_labels;
        this.y_labels = maidr.y_labels;
      } else {
        let elDy = '3.15';
        if (constants.plotOrientation == 'vert') {
          elDy = '6.3';
        }
        let els = constants.chart.querySelectorAll('tspan[dy="' + elDy + '"]');
        for (let i = 0; i < els.length; i++) {
          labels.push(els[i].innerHTML.trim());
        }
        if (constants.plotOrientation == 'vert') {
          this.x_labels = labels;
          this.y_labels = [];
        } else {
          this.x_labels = [];
          this.y_labels = labels;
        }
      }

      // main data
      if (typeof maidr !== 'undefined') {
        this.plotData = maidr.data;
      } else {
        this.plotData = maidr;
      }
    } else {
      this.x_group_label = constants.chart.getElementById(
        'GRID.text.199.1.1.tspan.1'
      ).innerHTML;
      this.y_group_label = constants.chart.getElementById(
        'GRID.text.202.1.1.tspan.1'
      ).innerHTML;
      if (constants.plotOrientation == 'vert') {
        this.x_labels = this.GetLabels();
        this.y_labels = [];
      } else {
        this.x_labels = [];
        this.y_labels = this.GetLabels();
      }
      this.plotData = this.GetData(); // main json data
    }

    if (constants.plotId) {
      this.plotBounds = this.GetPlotBounds(constants.plotId); // bound data
      constants.hasRect = true;
    } else {
      constants.hasRect = false;
    }

    this.CleanData();
  }

  GetLabels() {
    let labels = [];
    let query = 'tspan[dy="5"]';
    let els = constants.chart.querySelectorAll(query);
    for (let i = 0; i < els.length; i++) {
      labels.push(els[i].innerHTML.trim());
    }
    return labels;
  }

  CleanData() {
    // we manually input data, so now we need to clean it up and set other vars

    if (constants.plotOrientation == 'vert') {
      constants.minY = 0;
      constants.maxY = 0;
      for (let i = 0; i < this.plotData.length; i++) {
        // each plot
        for (let j = 0; j < this.plotData[i].length; j++) {
          // each section in plot
          let point = this.plotData[i][j];
          if (point.hasOwnProperty('y')) {
            if (point.y < constants.minY) {
              constants.yMin = point.y;
            }
            if (point.hasOwnProperty('yMax')) {
              if (point.yMax > constants.maxY) {
                constants.maxY = point.yMax;
              }
            } else {
              if (point.y > constants.maxY) {
                constants.maxY = point.y;
              }
            }
          }
          if (point.hasOwnProperty('x')) {
            if (point.x < constants.minX) {
              constants.minX = point.x;
            }
            if (point.x > constants.maxX) {
              constants.maxX = point.x;
            }
          }
        }
      }
    } else {
      constants.minX = 0;
      constants.maxX = 0;
      for (let i = 0; i < this.plotData.length; i++) {
        // each plot
        for (let j = 0; j < this.plotData[i].length; j++) {
          // each section in plot
          let point = this.plotData[i][j];
          if (point.hasOwnProperty('x')) {
            if (point.x < constants.minX) {
              constants.xMin = point.x;
            }
            if (point.hasOwnProperty('xMax')) {
              if (point.xMax > constants.maxX) {
                constants.maxX = point.xMax;
              }
            } else {
              if (point.x > constants.maxX) {
                constants.maxX = point.x;
              }
            }
          }
          if (point.hasOwnProperty('y')) {
            if (point.y < constants.minY) {
              constants.minY = point.y;
            }
            if (point.y > constants.maxY) {
              constants.maxY = point.y;
            }
          }
        }
      }
    }
  }

  GetData() {
    // data in chart is formed as nested <g> elements. Loop through and get all point data
    // goal is to get bounding x values and type (outlier, whisker, range, placeholder)

    let plotData = [];

    let plots = document.getElementById(constants.plotId).children;
    for (let i = 0; i < plots.length; i++) {
      // each plot

      let sections = plots[i].children;
      let points = [];
      for (let j = 0; j < sections.length; j++) {
        // each segment (outlier, whisker, etc)
        // get segments for this section, there are 2 each
        // sometimes they're 0, so ignore those TODO
        let segments = sections[j].children;
        for (let k = 0; k < segments.length; k++) {
          let segment = segments[k];

          let segmentType = this.GetBoxplotSegmentType(
            sections[j].getAttribute('id')
          );
          let segmentPoints = this.GetBoxplotSegmentPoints(
            segment,
            segmentType
          );

          for (let l = 0; l < segmentPoints.length; l += 2) {
            if (
              segmentType == 'whisker' &&
              l == 0 &&
              constants.plotOrientation == 'vert'
            ) {
            } else {
              let thisPoint = {
                x: Number(segmentPoints[l]),
                y: Number(segmentPoints[l + 1]),
                type: segmentType,
              };
              if (thisPoint.y > constants.maxY) constants.maxY = thisPoint.y;
              points.push(thisPoint);
            }
          }
        }
      }

      // post processing
      // Sort this plot
      points.sort(function (a, b) {
        if (constants.plotOrientation == 'vert') {
          return a.y - b.y;
        } else {
          return a.x - b.x;
        }
      });

      if (constants.plotOrientation == 'horz') {
        // and remove whisker from range dups
        let noDupPoints = [];
        for (let d = 0; d < points.length; d++) {
          if (d > 0) {
            if (points[d - 1].x == points[d].x) {
              if (points[d - 1].type == 'whisker') {
                noDupPoints.splice(-1, 1);
                noDupPoints.push(points[d]);
              } else {
              }
            } else {
              noDupPoints.push(points[d]);
            }
          } else {
            noDupPoints.push(points[d]);
          }
        }
        points = noDupPoints;
      }

      plotData.push(points);
    }

    // put plots in order
    plotData.sort(function (a, b) {
      if (constants.plotOrientation == 'vert') {
        return a[0].x - b[0].x;
      } else {
        return a[0].y - b[0].y;
      }
    });

    // combine outliers into a single object for easier display
    // info to grab: arr of values=y's or x's, y or x = ymin or xmin, yn xn = ymax xmax. The rest can stay as is
    for (let i = 0; i < plotData.length; i++) {
      let section = plotData[i];
      // loop through points and find outliers
      let outlierGroup = [];
      for (let j = 0; j < section.length + 1; j++) {
        let runProcessOutliers = false; // run if we're past outliers (catching the first set), or if we're at the end (catching the last set)
        if (j == section.length) {
          runProcessOutliers = true;
        } else if (section[j].type != 'outlier') {
          runProcessOutliers = true;
        }
        if (!runProcessOutliers) {
          // add this to the group and continue
          outlierGroup.push(section[j]);
        } else if (outlierGroup.length > 0) {
          // process!! This is the main bit of work done
          let vals = [];
          for (let k = 0; k < outlierGroup.length; k++) {
            // save array of values
            if (constants.plotOrientation == 'vert') {
              vals.push(outlierGroup[k].y);
            } else {
              vals.push(outlierGroup[k].x);
            }

            // We're only keeping 1 outlier value, so mark all others to delete after we're done processing
            if (k > 0) {
              plotData[i][j + k - outlierGroup.length].type = 'delete';
            }
          }

          // save data
          if (constants.plotOrientation == 'vert') {
            plotData[i][j - outlierGroup.length].y = outlierGroup[0].y;
            plotData[i][j - outlierGroup.length].yMax =
              outlierGroup[outlierGroup.length - 1].y;
          } else {
            plotData[i][j - outlierGroup.length].x = outlierGroup[0].x;
            plotData[i][j - outlierGroup.length].xMax =
              outlierGroup[outlierGroup.length - 1].x;
          }
          plotData[i][j - outlierGroup.length].values = vals;

          // reset for next set
          outlierGroup = [];
        }
      }
    }
    // clean up from the above outlier processing
    let cleanData = [];
    for (let i = 0; i < plotData.length; i++) {
      cleanData[i] = [];
      for (let j = 0; j < plotData[i].length; j++) {
        if (plotData[i][j].type != 'delete') {
          cleanData[i][j] = plotData[i][j];
        }
      }
      cleanData[i] = cleanData[i].filter(function () {
        return true;
      });
    }
    plotData = cleanData;

    // add labeling for display
    for (let i = 0; i < plotData.length; i++) {
      // each box section
      let rangeCounter = 0;
      for (let j = 0; j < plotData[i].length; j++) {
        let point = plotData[i][j];
        // each point, decide based on position with respect to range
        if (point.type == 'outlier') {
          if (rangeCounter > 0) {
            plotData[i][j].label = resources.GetString('upper_outlier');
          } else {
            plotData[i][j].label = resources.GetString('lower_outlier');
          }
        } else if (point.type == 'whisker') {
          if (rangeCounter > 0) {
            plotData[i][j].label = resources.GetString('max');
          } else {
            plotData[i][j].label = resources.GetString('min');
          }
        } else if (point.type == 'range') {
          if (rangeCounter == 0) {
            plotData[i][j].label = resources.GetString('25');
          } else if (rangeCounter == 1) {
            plotData[i][j].label = resources.GetString('50');
          } else if (rangeCounter == 2) {
            plotData[i][j].label = resources.GetString('75');
          }
          rangeCounter++;
        }
      }
    }

    // often a plot doesn't have various sections.
    // we expect outlier - min - 25 - 50 - 75 - max - outlier
    // add blank placeholders where they don't exist for better vertical navigation
    let allWeNeed = this.GetAllSegmentTypes();
    for (let i = 0; i < plotData.length; i++) {
      if (plotData[i].length == 7) {
        // skip, this one has it all. The rare boi
      } else {
        let whatWeGot = []; // we'll get a set of labels that we have so we can find what's missing
        for (let j = 0; j < plotData[i].length; j++) {
          whatWeGot.push(plotData[i][j].label);
        }

        // add missing stuff where it should go. We use .label as the user facing var (todo, might be a mistake, maybe use .type?)
        for (let j = 0; j < allWeNeed.length; j++) {
          if (!whatWeGot.includes(allWeNeed[j])) {
            // add a blank where it belongs
            let blank = { type: 'blank', label: allWeNeed[j] };
            plotData[i].splice(j, 0, blank);
            whatWeGot.splice(j, 0, allWeNeed[j]);
          }
        }
      }
    }

    // update 50% value as a midpoint of 25 and 75
    for (let i = 0; i < plotData.length; i++) {
      plotData[i][3].y = Math.round((plotData[i][2].y + plotData[i][4].y) / 2);
    }

    if (constants.debugLevel > 1) {
      console.log('plotData:', plotData);
    }

    return plotData;
  }

  GetPlotBounds(plotId) {
    // we fetch the elements in our parent, and similar to GetData we run through and get bounding boxes (or blanks) for everything, and store in an identical structure

    let plotBounds = [];
    let allWeNeed = this.GetAllSegmentTypes();
    let re = /(?:\d+(?:\.\d*)?|\.\d+)/g;

    // get initial set of elements, a parent element for all outliers, whiskers, and range
    let initialElemSet = [];
    let plots = document.getElementById(constants.plotId).children;
    for (let i = 0; i < plots.length; i++) {
      // each plot
      let plotSet = {};
      let sections = plots[i].children;
      for (let j = 0; j < sections.length; j++) {
        let elemType = this.GetBoxplotSegmentType(
          sections[j].getAttribute('id')
        );
        plotSet[elemType] = sections[j];
      }
      initialElemSet.push(plotSet);
    }

    // we build our structure based on the full set we need, and have blanks as placeholders
    // many of these overlap or are missing, so now we go through and make the actual array structure we need
    // like, all outliers are in 1 set, so we have to split those out and then get the bounding boxes
    for (let i = 0; i < initialElemSet.length; i++) {
      let plotBound = [];

      // we always have a range, and need those bounds to set others, so we'll do this first
      let rangeBounds = initialElemSet[i].range.getBoundingClientRect();

      // we get the midpoint from actual point values in the chart GRID.segments
      let midPoints = initialElemSet[i].range
        .querySelector('polyline[id^="GRID"]')
        .getAttribute('points')
        .match(re);
      let rangePoints = initialElemSet[i].range
        .querySelector('polygon[id^="geom_polygon"]')
        .getAttribute('points')
        .match(re);
      // get midpoint as percentage from bottom to mid to apply to bounding boxes
      // vert: top(rangePoints[1]) | mid(midPoints[1]) | bottom(rangePoints[3])
      // horz: top(rangePoints[0]) | mid(midPoints[0]) | bottom(rangePoints[2])
      let midPercent = 0;
      if (constants.plotOrientation == 'vert') {
        midPercent =
          (midPoints[1] - rangePoints[3]) / (rangePoints[1] - rangePoints[3]);
      } else {
        midPercent =
          (midPoints[0] - rangePoints[2]) / (rangePoints[0] - rangePoints[2]);
      }
      let midSize = 0;
      if (constants.plotOrientation == 'vert') {
        midSize = rangeBounds.height * midPercent;
      } else {
        midSize = rangeBounds.width * midPercent;
      }

      // set bounding box values
      // we critically need x / left, y / top, width, height. We can ignore the rest or let it be wrong

      // 25%
      plotBound[2] = this.convertBoundingClientRectToObj(rangeBounds);
      plotBound[2].label = allWeNeed[2];
      plotBound[2].type = 'range';
      if (constants.plotOrientation == 'vert') {
        plotBound[2].height = midSize;
        plotBound[2].top = plotBound[2].bottom - midSize;
        plotBound[2].y = plotBound[2].top;
      } else {
        plotBound[2].width = midSize;
      }
      // 50%
      plotBound[3] = this.convertBoundingClientRectToObj(rangeBounds);
      plotBound[3].label = allWeNeed[3];
      plotBound[3].type = 'range';
      if (constants.plotOrientation == 'vert') {
        plotBound[3].height = 0;
        plotBound[3].top = rangeBounds.bottom - midSize;
        plotBound[3].y = plotBound[3].top;
        plotBound[3].bottom = plotBound[3].top;
      } else {
        plotBound[3].width = 0;
        plotBound[3].left = rangeBounds.left + midSize;
      }
      // 75%
      plotBound[4] = this.convertBoundingClientRectToObj(rangeBounds);
      plotBound[4].label = allWeNeed[4];
      plotBound[4].type = 'range';
      if (constants.plotOrientation == 'vert') {
        plotBound[4].height = rangeBounds.height - midSize;
        plotBound[4].bottom = plotBound[3].top;
      } else {
        plotBound[4].width = rangeBounds.width - midSize;
        plotBound[4].left = plotBound[3].left;
      }

      // now the tricky ones, outliers and whiskers, if we have them
      if (Object.hasOwn(initialElemSet[i], 'whisker')) {
        // ok great we have a whisker. It could be just above or below or span across the range (in which case we need to split it up). Let's check
        let whiskerBounds = initialElemSet[i].whisker.getBoundingClientRect();
        let hasBelow = false;
        let hasAbove = false;
        if (constants.plotOrientation == 'vert') {
          if (whiskerBounds.bottom > rangeBounds.bottom) hasBelow = true;
          if (whiskerBounds.top < rangeBounds.top) hasAbove = true;
        } else {
          if (whiskerBounds.left < rangeBounds.left) hasBelow = true;
          if (whiskerBounds.right > rangeBounds.right) hasAbove = true;
        }

        // lower whisker
        if (hasBelow) {
          plotBound[1] = this.convertBoundingClientRectToObj(whiskerBounds);
          plotBound[1].label = allWeNeed[1];
          plotBound[1].type = 'whisker';
          if (constants.plotOrientation == 'vert') {
            plotBound[1].top = plotBound[2].bottom;
            plotBound[1].y = plotBound[1].top;
            plotBound[1].height = plotBound[1].bottom - plotBound[1].top;
          } else {
            plotBound[1].width = plotBound[2].left - plotBound[1].left;
          }
        } else {
          plotBound[1] = {};
          plotBound[1].label = allWeNeed[1];
          plotBound[1].type = 'blank';
        }
        // upper whisker
        if (hasAbove) {
          plotBound[5] = this.convertBoundingClientRectToObj(whiskerBounds);
          plotBound[5].label = allWeNeed[5];
          plotBound[5].type = 'whisker';
          if (constants.plotOrientation == 'vert') {
            plotBound[5].bottom = plotBound[4].top;
            plotBound[5].height = plotBound[5].bottom - plotBound[5].top;
          } else {
            plotBound[5].left = plotBound[4].right;
            plotBound[5].x = plotBound[4].right;
            plotBound[5].width = plotBound[5].right - plotBound[5].left;
          }
        } else {
          plotBound[5] = {};
          plotBound[5].label = allWeNeed[5];
          plotBound[5].type = 'blank';
        }
      }
      if (Object.hasOwn(initialElemSet[i], 'outlier')) {
        // we have one or more outliers.
        // Where do they appear? above or below the range? both?
        // we want to split them up and put 1 bounding box around each above and below

        let outlierElems = initialElemSet[i].outlier.children;
        let outlierUpperBounds = null;
        let outlierLowerBounds = null;
        for (let j = 0; j < outlierElems.length; j++) {
          // add this outlier's bounds, or expand if more than one
          let newOutlierBounds = outlierElems[j].getBoundingClientRect();

          if (constants.plotOrientation == 'vert') {
            if (newOutlierBounds.y < rangeBounds.y) {
              // higher, remember y=0 is at the bottom of the page
              if (!outlierUpperBounds) {
                outlierUpperBounds =
                  this.convertBoundingClientRectToObj(newOutlierBounds);
              } else {
                if (newOutlierBounds.y < outlierUpperBounds.y)
                  outlierUpperBounds.y = newOutlierBounds.y;
                if (newOutlierBounds.top < outlierUpperBounds.top)
                  outlierUpperBounds.top = newOutlierBounds.top;
                if (newOutlierBounds.bottom > outlierUpperBounds.bottom)
                  outlierUpperBounds.bottom = newOutlierBounds.bottom;
              }
            } else {
              if (!outlierLowerBounds) {
                outlierLowerBounds =
                  this.convertBoundingClientRectToObj(newOutlierBounds);
              } else {
                if (newOutlierBounds.y < outlierLowerBounds.y)
                  outlierLowerBounds.y = newOutlierBounds.y;
                if (newOutlierBounds.top < outlierLowerBounds.top)
                  outlierLowerBounds.top = newOutlierBounds.top;
                if (newOutlierBounds.bottom > outlierLowerBounds.bottom)
                  outlierLowerBounds.bottom = newOutlierBounds.bottom;
              }
            }
          } else {
            if (newOutlierBounds.x > rangeBounds.x) {
              // higher, remember x=0 is at the left of the page
              if (!outlierUpperBounds) {
                outlierUpperBounds =
                  this.convertBoundingClientRectToObj(newOutlierBounds);
              } else {
                if (newOutlierBounds.x < outlierUpperBounds.x)
                  outlierUpperBounds.x = newOutlierBounds.x;
                if (newOutlierBounds.left < outlierUpperBounds.left)
                  outlierUpperBounds.left = newOutlierBounds.left;
                if (newOutlierBounds.right > outlierUpperBounds.right)
                  outlierUpperBounds.right = newOutlierBounds.right;
              }
            } else {
              if (!outlierLowerBounds) {
                outlierLowerBounds =
                  this.convertBoundingClientRectToObj(newOutlierBounds);
              } else {
                if (newOutlierBounds.x < outlierLowerBounds.x)
                  outlierLowerBounds.x = newOutlierBounds.x;
                if (newOutlierBounds.left < outlierLowerBounds.left)
                  outlierLowerBounds.left = newOutlierBounds.left;
                if (newOutlierBounds.right > outlierLowerBounds.right)
                  outlierLowerBounds.right = newOutlierBounds.right;
              }
            }
          }
        }

        // now we add plotBound outlier stuff
        if (outlierLowerBounds) {
          outlierLowerBounds.height =
            outlierLowerBounds.bottom - outlierLowerBounds.top;
          outlierLowerBounds.width =
            outlierLowerBounds.right - outlierLowerBounds.left;

          plotBound[0] =
            this.convertBoundingClientRectToObj(outlierLowerBounds);
          plotBound[0].label = allWeNeed[0];
          plotBound[0].type = 'outlier';
        } else {
          plotBound[0] = {};
          plotBound[0].label = allWeNeed[0];
          plotBound[0].type = 'blank';
        }
        if (outlierUpperBounds) {
          outlierUpperBounds.height =
            outlierUpperBounds.bottom - outlierUpperBounds.top;
          outlierUpperBounds.width =
            outlierUpperBounds.right - outlierUpperBounds.left;

          plotBound[6] =
            this.convertBoundingClientRectToObj(outlierUpperBounds);
          plotBound[6].label = allWeNeed[6];
          plotBound[6].type = 'outlier';
        } else {
          plotBound[6] = {};
          plotBound[6].label = allWeNeed[6];
          plotBound[6].type = 'blank';
        }
      } else {
        // add all blanks
        plotBound[0] = {};
        plotBound[0].label = allWeNeed[0];
        plotBound[0].type = 'blank';
        plotBound[6] = {};
        plotBound[6].label = allWeNeed[6];
        plotBound[6].type = 'blank';
      }

      plotBounds.push(plotBound);
    }

    if (constants.debugLevel > 5) {
      console.log('plotBounds', plotBounds);
    }

    return plotBounds;
  }

  GetAllSegmentTypes() {
    let allWeNeed = [
      resources.GetString('lower_outlier'),
      resources.GetString('min'),
      resources.GetString('25'),
      resources.GetString('50'),
      resources.GetString('75'),
      resources.GetString('max'),
      resources.GetString('upper_outlier'),
    ];

    return allWeNeed;
  }

  GetBoxplotSegmentType(sectionId) {
    // Helper function for main GetData:
    // Fetch type, which comes from section id:
    // geom_polygon = range
    // GRID = whisker
    // points = outlier

    let segmentType = 'outlier'; // default? todo: should probably default null, and then throw error instead of return if not set after ifs
    if (sectionId.includes('geom_crossbar')) {
      segmentType = 'range';
    } else if (sectionId.includes('GRID')) {
      segmentType = 'whisker';
    } else if (sectionId.includes('points')) {
      segmentType = 'outlier';
    }

    return segmentType;
  }
  GetBoxplotSegmentPoints(segment, segmentType) {
    // Helper function for main GetData:
    // Fetch x and y point data from chart

    let re = /(?:\d+(?:\.\d*)?|\.\d+)/g;
    let pointString = '';
    let points = [];
    if (segmentType == 'range') {
      // ranges go a level deeper
      let matches = segment.children[0].getAttribute('points').match(re);
      points.push(matches[0], matches[1]);
      // the middle bar has 2 points but we just need one, check if they're the same
      if (matches[0] != matches[2]) {
        points.push(matches[2], matches[3]);
      }
    } else if (segmentType == 'outlier') {
      // outliers use x attr directly, but have multiple children
      points.push(segment.getAttribute('x'), segment.getAttribute('y'));
    } else {
      // whisker. Get first and third number from points attr
      // but sometimes it's null, giving the same for both, and don't add if that's true
      let matches = segment.getAttribute('points').match(re);
      if (constants.plotOrientation == 'vert') {
        if (matches[1] != matches[3]) {
          points.push(matches[0], matches[1], matches[2], matches[3]);
        }
      } else {
        if (matches[0] != matches[2]) {
          points.push(matches[0], matches[1], matches[2], matches[3]);
        }
      }
    }

    return points;
  }

  convertBoundingClientRectToObj(rect) {
    return {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      x: rect.x,
      y: rect.y,
    };
  }

  PlayTones(audio) {
    let plotPos = null;
    let sectionPos = null;
    if (constants.outlierInterval) clearInterval(constants.outlierInterval);
    if (constants.plotOrientation == 'vert') {
      plotPos = position.x;
      sectionPos = position.y;
    } else {
      plotPos = position.y;
      sectionPos = position.x;
    }
    if (plot.plotData[plotPos][sectionPos].type == 'blank') {
      audio.PlayNull();
    } else if (plot.plotData[plotPos][sectionPos].type != 'outlier') {
      audio.playTone();
    } else {
      // outlier(s): we play a run of tones
      position.z = 0;
      constants.outlierInterval = setInterval(function () {
        // play this tone
        audio.playTone();

        // and then set up for the next one
        position.z += 1;

        // and kill if we're done
        if (!Object.hasOwn(plot.plotData[plotPos][sectionPos], 'values')) {
          clearInterval(constants.outlierInterval);
          position.z = -1;
        } else if (
          position.z + 1 >
          plot.plotData[plotPos][sectionPos].values.length
        ) {
          clearInterval(constants.outlierInterval);
          position.z = -1;
        }
      }, constants.autoPlayOutlierRate);
    }
  }
}

// BoxplotRect class
// Initializes and updates the visual outline around sections of the chart
class BoxplotRect {
  // maybe put this stuff in user config?
  rectPadding = 15; // px
  rectStrokeWidth = 4; // px

  constructor() {
    this.x1 = 0;
    this.width = 0;
    this.y1 = 0;
    this.height = 0;
    this.chartOffsetLeft = constants.chart.getBoundingClientRect().left;
    this.chartOffsetTop = constants.chart.getBoundingClientRect().top;
  }

  UpdateRect() {
    // UpdateRect takes bounding box values from the object and gets bounds of visual outline to be drawn

    if (document.getElementById('highlight_rect'))
      document.getElementById('highlight_rect').remove(); // destroy to be recreated

    let plotPos = position.x;
    let sectionPos = position.y;
    if (constants.plotOrientation == 'vert') {
    } else {
      plotPos = position.y;
      sectionPos = position.x;
    }

    if (
      (constants.plotOrientation == 'vert' && position.y > -1) ||
      (constants.plotOrientation == 'horz' && position.x > -1)
    ) {
      // initial value could be -1, which throws errors, so ignore that

      let bounds = plot.plotBounds[plotPos][sectionPos];

      if (bounds.type != 'blank') {
        //let chartBounds = constants.chart.getBoundingClientRect();

        this.x1 = bounds.left - this.rectPadding - this.chartOffsetLeft;
        this.width = bounds.width + this.rectPadding * 2;
        this.y1 = bounds.top - this.rectPadding - this.chartOffsetTop;
        this.height = bounds.height + this.rectPadding * 2;

        if (constants.debugLevel > 5) {
          console.log(
            'Point',
            plot.plotData[plotPos][sectionPos].label,
            'bottom:',
            bounds.bottom,
            'top:',
            bounds.top
          );
          console.log(
            'x1:',
            this.x1,
            'y1:',
            this.y1,
            'width:',
            this.width,
            'height:',
            this.height
          );
        }

        this.CreateRectDisplay();
      }
    }
  }

  CreateRectDisplay() {
    // CreateRectDisplay takes bounding points and creates the visual outline

    const svgns = 'http://www.w3.org/2000/svg';
    let rect = document.createElementNS(svgns, 'rect');
    rect.setAttribute('id', 'highlight_rect');
    rect.setAttribute('x', this.x1);
    rect.setAttribute('y', this.y1); // y coord is inverse from plot data
    rect.setAttribute('width', this.width);
    rect.setAttribute('height', this.height);
    rect.setAttribute('stroke', constants.colorSelected);
    rect.setAttribute('stroke-width', this.rectStrokeWidth);
    rect.setAttribute('fill', 'none');
    constants.chart.appendChild(rect);
  }
}
