class Segmented {
  constructor() {
    // initialize variables level, data, and elements
    let level = null;
    let fill = null;
    let data = null;
    let elements = null;
    if ('axes' in singleMaidr) {
      //axes.x.level
      if ('x' in singleMaidr.axes) {
        if ('level' in singleMaidr.axes.x) {
          level = singleMaidr.axes.x.level;
        }
      } else if ('y' in singleMaidr.axes) {
        if ('level' in singleMaidr.axes.y) {
          level = singleMaidr.axes.y.level;
        }
      }
      // axes.fill
      if ('fill' in singleMaidr.axes) {
        if ('level' in singleMaidr.axes.fill) {
          fill = singleMaidr.axes.fill.level;
        }
      }
    }
    if ('data' in singleMaidr) {
      data = singleMaidr.data;
    }
    if ('elements' in singleMaidr) {
      elements = singleMaidr.elements;
    }

    // gracefull failure: must have level + fill + data, elements optional
    if (level != null && fill != null && data != null) {
      this.level = level;
      this.fill = fill.reverse(); // typically fill is in reverse order
      this.plotData = this.ParseData(data);
    } else {
      console.log(
        'Segmented chart missing level, fill, or data. Unable to create chart.'
      );
      return;
    }
    if (elements == null) {
      LogError.LogAbsentElement('elements');
      constants.hasRect = 0;
    }

    // column labels, both legend and tick
    let legendX = '';
    let legendY = '';
    if ('axes' in singleMaidr) {
      // legend labels
      if (singleMaidr.axes.x) {
        if (singleMaidr.axes.x.label) {
          legendX = singleMaidr.axes.x.label;
        }
      }
      if (singleMaidr.axes.y) {
        if (singleMaidr.axes.y.label) {
          legendY = singleMaidr.axes.y.label;
        }
      }
    }
    // labels override axes
    if ('labels' in singleMaidr) {
      if ('x' in singleMaidr.labels) {
        legendX = singleMaidr.labels.x;
      }
      if ('y' in singleMaidr.labels) {
        legendY = singleMaidr.labels.y;
      }
    }

    this.plotLegend = {
      x: legendX,
      y: legendY,
    };

    // title
    this.title = '';
    if ('labels' in singleMaidr) {
      if ('title' in singleMaidr.labels) {
        this.title = singleMaidr.labels.title;
      }
    }
    if (this.title == '') {
      if ('title' in singleMaidr) {
        this.title = singleMaidr.title;
      }
    }

    // subtitle
    if ('labels' in singleMaidr) {
      if ('subtitle' in singleMaidr.labels) {
        this.subtitle = singleMaidr.labels.subtitle;
      }
    }
    // caption
    if ('labels' in singleMaidr) {
      if ('caption' in singleMaidr.labels) {
        this.caption = singleMaidr.labels.caption;
      }
    }

    // set the max and min values for the plot
    this.SetMaxMin();

    this.autoplay = null;
  }

  ParseData(data) {
    let plotData = [];

    // create a full 2d array of data using level and fill
    for (let i = 0; i < this.level.length; i++) {
      for (let j = 0; j < this.fill.length; j++) {
        // loop through data, find matching level and fill, assign value
        // if no match, assign null
        for (let k = 0; k < data.length; k++) {
          if (!plotData[i]) {
            plotData[i] = [];
          }
          if (!plotData[i][j]) {
            plotData[i][j] = 0;
          }
          if (data[k].x == this.level[i] && data[k].fill == this.fill[j]) {
            plotData[i][j] = data[k].y;
            break;
          }
        }
      }
    }

    return plotData;
  }

  SetMaxMin() {
    for (let i = 0; i < this.plotData.length; i++) {
      if (i == 0) {
        constants.maxY = this.plotData[i];
        constants.minY = this.plotData[i];
      } else {
        if (this.plotData[i] > constants.maxY) {
          constants.maxY = this.plotData[i];
        }
        if (this.plotData[i] < constants.minY) {
          constants.minY = this.plotData[i];
        }
      }
    }
    constants.maxX = this.level.length;
    constants.autoPlayRate = Math.min(
      Math.ceil(constants.AUTOPLAY_DURATION / (constants.maxX + 1)),
      constants.MAX_SPEED
    );
  }

  Select() {
    this.DeselectAll();
    if (this.bars) {
      this.bars[position.x].style.fill = constants.colorSelected;
    }
  }

  DeselectAll() {
    if (this.bars) {
      for (let i = 0; i < this.bars.length; i++) {
        this.bars[i].style.fill = constants.colorUnselected;
      }
    }
  }
}
