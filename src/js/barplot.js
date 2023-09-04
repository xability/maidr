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
      if (xlevel.length != data.length) {
        // I didn't throw an error but give a warning
        constants.hasRect = 0;
        console.log(
          'Warning: x level and data do not have the same length. This may cause errors.Visual highlighting is turned off.'
        );
      } else if (xlevel.length != elements.length) {
        constants.hasRect = 0;
        console.log(
          'Warning: x level and elements do not have the same length. This may cause errors. Visual highlighting is turned off.'
        );
      } else if (data.length != elements.length) {
        constants.hasRect = 0;
        console.log(
          'Warning: data and elements do not have the same length. This may cause errors. Visual highlighting is turned off.'
        );
      } else {
        this.bars = elements;
        constants.hasRect = 1;
      }
    } else if (data && elements) {
      if (data.length != elements.length) {
        constants.hasRect = 0;
        console.log(
          'Warning: data and elements do not have the same length. This may cause errors. Visual highlighting is turned off.'
        );
      } else {
        this.bars = elements;
        constants.hasRect = 1;
      }
    } else if (xlevel && data) {
      if (xlevel.length != data.length) {
        constants.hasRect = 0;
        console.log(
          'Warning: x level and data do not have the same length. This may cause errors.Visual highlighting is turned off.'
        );
      }
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
    } else {
      // legend labels
      if (constants.chart.querySelector('g[id^="xlab"] tspan')) {
        legendX = constants.chart.querySelector(
          'g[id^="xlab"] tspan'
        ).innerHTML;
      }
      if (constants.chart.querySelector('g[id^="ylab"] tspan')) {
        legendY = constants.chart.querySelector(
          'g[id^="ylab"] tspan'
        ).innerHTML;
      }

      // tick labels
      this.columnLabels = this.ParseInnerHTML(
        constants.chart.querySelectorAll(
          'g:not([id^="xlab"]):not([id^="ylab"]) > g > g > g > text[text-anchor="middle"]'
        )
      );
    }

    this.plotLegend = {
      x: legendX,
      y: legendY,
    };

    // title, either pulled from data or from the SVG
    this.title = '';
    if ('title' in singleMaidr) {
      this.title = singleMaidr.title;
    } else if (
      constants.chart.querySelector('g[id^="plot.title..titleGrob"] tspan')
    ) {
      this.title = constants.chart.querySelector(
        'g[id^="plot.title..titleGrob"] tspan'
      ).innerHTML;
      this.title = this.title.replace('\n', '').replace(/ +(?= )/g, ''); // there are multiple spaces and newlines, sometimes
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
