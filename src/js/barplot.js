class BarChart {
  constructor() {
    // initialize variables xlevel, data, and elements
    let xlevel = null;
    if ('axes' in singleMaidr) {
      if (singleMaidr.axes.x) {
        if (singleMaidr.axes.x.level) {
          xlevel = singleMaidr.axes.x.level;
        }
      }
      // todo: handle y for vertical bar charts
    }
    let data = null;
    if ('data' in singleMaidr) {
      data = singleMaidr.data;
    }
    let elements = null;
    if ('elements' in singleMaidr) {
      elements = singleMaidr.elements;
    }

    if (xlevel && data && elements) {
      if (elements.length != data.length) {
        // I didn't throw an error but give a warning
        constants.hasRect = 0;
        logError.logDifferentLengths('elements', 'data');
      } else if (xlevel.length != elements.length) {
        constants.hasRect = 0;
        logError.logDifferentLengths('x level', 'elements');
      } else if (data.length != xlevel.length) {
        constants.hasRect = 0;
        logError.logDifferentLengths('x level', 'data');
      } else {
        this.bars = elements;
        constants.hasRect = 1;
      }
    } else if (data && elements) {
      if (data.length != elements.length) {
        constants.hasRect = 0;
        logError.logDifferentLengths('data', 'elements');
      } else {
        this.bars = elements;
        constants.hasRect = 1;
      }
    } else if (xlevel && data) {
      if (xlevel.length != data.length) {
        constants.hasRect = 0;
        logError.logDifferentLengths('x level', 'data');
      }
      logError.LogAbsentElement('elements');
    } else if (data) {
      logError.LogAbsentElement('x level');
      logError.LogAbsentElement('elements');
    }

    // bars. The actual bar elements in the SVG. Used to highlight visually
    // if ('elements' in singleMaidr) {
    //   this.bars = singleMaidr.elements;
    //   constants.hasRect = 1;
    // } else {
    //   // this.bars = constants.chart.querySelectorAll('g[id^="geom_rect"] > rect'); // if we use plot.plotData.length instead of plot.bars.length, we don't have to include this
    //   constants.hasRect = 0;
    // }

    // column labels, both legend and tick
    this.columnLabels = [];
    let legendX = '';
    let legendY = '';
    if ('labels' in singleMaidr) {
      if ('x' in singleMaidr.labels) {
        legendX = singleMaidr.labels.x;
      }
      if ('y' in singleMaidr.labels) {
        legendY = singleMaidr.labels.y;
      }
    }
    if ('axes' in singleMaidr) {
      // legend labels
      if (singleMaidr.axes.x) {
        if (singleMaidr.axes.x.label) {
          if (legendX == '') {
            legendX = singleMaidr.axes.x.label;
          }
        }
      }
      if (singleMaidr.axes.y) {
        if (singleMaidr.axes.y.label) {
          if (legendY == '') {
            legendY = singleMaidr.axes.y.label;
          }
        }
      }

      // tick labels
      if (singleMaidr.axes.x) {
        if (singleMaidr.axes.x.level) {
          this.columnLabels = singleMaidr.axes.x.level;
        }
      }
      if (singleMaidr.axes.y) {
        if (singleMaidr.axes.y.level) {
          this.columnLabels = singleMaidr.axes.y.level;
        }
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

    if (Array.isArray(singleMaidr)) {
      this.plotData = singleMaidr;
    } else {
      if ('data' in singleMaidr) {
        this.plotData = singleMaidr.data;
      }
    }

    // set the max and min values for the plot
    this.SetMaxMin();

    this.autoplay = null;
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
    constants.maxX = this.columnLabels.length;
    constants.autoPlayRate = Math.min(
      Math.ceil(constants.AUTOPLAY_DURATION / (constants.maxX + 1)),
      constants.MAX_SPEED
    );
    constants.DEFAULT_SPEED = constants.autoPlayRate;
  }

  PlayTones() {
    audio.playTone();
  }

  GetLegendFromManualData() {
    let legend = {};

    legend.x = barplotLegend.x;
    legend.y = barplotLegend.y;

    return legend;
  }

  GetData() {
    // set height for each bar

    let plotData = [];

    if (this.bars) {
      for (let i = 0; i < this.bars.length; i++) {
        plotData.push(this.bars[i].getAttribute('height'));
      }
    }

    return plotData;
  }

  GetColumns() {
    // get column names
    // the pattern seems to be a <tspan> with dy="10", but check this for future output (todo)

    let columnLabels = [];
    let els = constants.chart.querySelectorAll('tspan[dy="10"]'); // todo, generalize this selector
    for (var i = 0; i < els.length; i++) {
      columnLabels.push(els[i].innerHTML);
    }

    return columnLabels;
  }

  GetLegend() {
    let legend = {};
    let els = constants.chart.querySelectorAll('tspan[dy="12"]'); // todo, generalize this selector
    legend.x = els[1].innerHTML;
    legend.y = els[0].innerHTML;

    return legend;
  }

  ParseInnerHTML(els) {
    // parse innerHTML of elements
    let parsed = [];
    for (var i = 0; i < els.length; i++) {
      parsed.push(els[i].innerHTML);
    }
    return parsed;
  }

  Select() {
    this.UnSelectPrevious();
    if (this.bars) {
      this.activeElement = this.bars[position.x];
      if (this.activeElement) {
        this.activeElementColor = this.activeElement.style.fill;
        this.activeElement.style.fill = constants.colorSelected;
      }
    }
  }

  UnSelectPrevious() {
    if (this.activeElement) {
      this.activeElement.style.fill = this.activeElementColor;
      this.activeElement = null;
    }
  }
}
