class HeatMap {
  constructor() {
    if ("elements" in maidr) {
      this.plots = maidr.elements;
      constants.hasRect = 1;
    } else {
      this.plots = document.querySelectorAll('g[id^="geom_rect"] > rect');
      constants.hasRect = 0;
    }

    this.group_labels = this.getGroupLabels();
    this.x_labels = this.getXLabels();
    this.y_labels = this.getYLabels();
    this.title = this.getTitle();

    this.plotData = this.getHeatMapData();
    this.updateConstants();

    this.x_coord = this.plotData[0];
    this.y_coord = this.plotData[1];
    this.values = this.plotData[2];
    this.num_rows = this.plotData[3];
    this.num_cols = this.plotData[4];

    this.x_group_label = this.group_labels[0].trim();
    this.y_group_label = this.group_labels[1].trim();
    this.box_label = this.group_labels[2].trim();
  }

  getHeatMapData() {
    // get the x_coord and y_coord to check if a square exists at the coordinates
    let x_coord_check = [];
    let y_coord_check = [];

    let unique_x_coord = [];
    let unique_y_coord = [];
    if (constants.hasRect) {
      for (let i = 0; i < this.plots.length; i++) {
        if (this.plots[i]) {
          x_coord_check.push(parseFloat(this.plots[i].getAttribute("x")));
          y_coord_check.push(parseFloat(this.plots[i].getAttribute("y")));
        }
      }

      // sort the squares to access from left to right, up to down
      x_coord_check.sort(function (a, b) {
        return a - b;
      }); // ascending
      y_coord_check
        .sort(function (a, b) {
          return a - b;
        })
        .reverse(); // descending

      // get unique elements from x_coord and y_coord
      unique_x_coord = [...new Set(x_coord_check)];
      unique_y_coord = [...new Set(y_coord_check)];
    }

    // get num of rows, num of cols, and total numbers of squares
    let num_rows = 0;
    let num_cols = 0;
    let num_squares = 0;
    if ("data" in maidr) {
      num_rows = maidr.data.length;
      num_cols = maidr.data[0].length;
    } else {
      num_rows = unique_y_coord.length;
      num_cols = unique_x_coord.length;
    }
    num_squares = num_rows * num_cols;

    let norms = [];
    if ("data" in maidr) {
      norms = [...maidr.data];
    } else {
      norms = Array(num_rows)
        .fill()
        .map(() => Array(num_cols).fill(0));
      let min_norm = 3 * Math.pow(255, 2);
      let max_norm = 0;

      for (var i = 0; i < this.plots.length; i++) {
        var x_index = unique_x_coord.indexOf(x_coord_check[i]);
        var y_index = unique_y_coord.indexOf(y_coord_check[i]);
        let norm = this.getRGBNorm(i);
        norms[y_index][x_index] = norm;

        if (norm < min_norm) min_norm = norm;
        if (norm > max_norm) max_norm = norm;
      }
    }

    let plotData = [unique_x_coord, unique_y_coord, norms, num_rows, num_cols];

    return plotData;
  }

  updateConstants() {
    constants.minX = 0;
    constants.maxX = this.plotData[4];
    constants.minY = this.plotData[2][0][0]; // initial val
    constants.maxY = this.plotData[2][0][0]; // initial val
    for (let i = 0; i < this.plotData[2].length; i++) {
      for (let j = 0; j < this.plotData[2][i].length; j++) {
        if (this.plotData[2][i][j] < constants.minY)
          constants.minY = this.plotData[2][i][j];
        if (this.plotData[2][i][j] > constants.maxY)
          constants.maxY = this.plotData[2][i][j];
      }
    }
  }

  getRGBNorm(i) {
    let rgb_string = this.plots[i].getAttribute("fill");
    let rgb_array = rgb_string.slice(4, -1).split(",");
    // just get the sum of squared value of rgb, similar without sqrt, save computation
    return rgb_array
      .map(function (x) {
        return Math.pow(x, 2);
      })
      .reduce(function (a, b) {
        return a + b;
      });
  }

  getGroupLabels() {
    let labels_nodelist;
    let title = "";
    let legendX = "";
    let legendY = "";

    if ("title" in maidr) {
      title = maidr.title;
    } else {
      title = document.querySelector(
        'g[id^="guide.title"] text > tspan'
      ).innerHTML;
    }

    if ("axes" in maidr) {
      if ("x" in maidr.axes) {
        if ("label" in maidr.axes.x) {
          legendX = maidr.axes.x.label;
        }
      }
      if ("y" in maidr.axes) {
        if ("label" in maidr.axes.y) {
          legendY = maidr.axes.y.label;
        }
      }
    } else {
      legendX = document.querySelector('g[id^="xlab"] text > tspan').innerHTML;
      legendY = document.querySelector('g[id^="ylab"] text > tspan').innerHTML;
    }

    labels_nodelist = [legendX, legendY, title];

    return labels_nodelist;
  }

  getXLabels() {
    if ("axes" in maidr) {
      if ("x" in maidr.axes) {
        if ("format" in maidr.axes.x) {
          return maidr.axes.x.format;
        }
      }
    } else {
      let x_labels_nodelist;
      x_labels_nodelist = document.querySelectorAll('tspan[dy="10"]');
      let labels = [];
      for (let i = 0; i < x_labels_nodelist.length; i++) {
        labels.push(x_labels_nodelist[i].innerHTML.trim());
      }

      return labels;
    }
  }

  getYLabels() {
    if ("axes" in maidr) {
      if ("y" in maidr.axes) {
        if ("format" in maidr.axes.y) {
          return maidr.axes.y.format;
        }
      }
    } else {
      let y_labels_nodelist;
      let labels = [];
      y_labels_nodelist = document.querySelectorAll(
        'tspan[id^="GRID.text.19.1"]'
      );
      for (let i = 0; i < y_labels_nodelist.length; i++) {
        labels.push(y_labels_nodelist[i].innerHTML.trim());
      }

      return labels.reverse();
    }
  }

  getTitle() {
    if ("title" in maidr) {
      return maidr.title;
    } else {
      let heatmapTitle = document.querySelector(
        'g[id^="layout::title"] text > tspan'
      ).innerHTML;
      if (
        constants.manualData &&
        typeof heatmapTitle !== "undefined" &&
        typeof heatmapTitle != null
      ) {
        return heatmapTitle;
      } else {
        return "";
      }
    }
  }
}

class HeatMapRect {
  constructor() {
    if (constants.hasRect) {
      this.x = plot.x_coord[0];
      this.y = plot.y_coord[0];
      this.rectStrokeWidth = 4; // px
      this.height = Math.abs(plot.y_coord[1] - plot.y_coord[0]);
    }
  }

  UpdateRect() {
    this.x = plot.x_coord[position.x];
    this.y = plot.y_coord[position.y];
  }

  UpdateRectDisplay() {
    this.UpdateRect();
    if (document.getElementById("highlight_rect"))
      document.getElementById("highlight_rect").remove(); // destroy and recreate
    const svgns = "http://www.w3.org/2000/svg";
    var rect = document.createElementNS(svgns, "rect");
    rect.setAttribute("id", "highlight_rect");
    rect.setAttribute("x", this.x);
    rect.setAttribute(
      "y",
      constants.svg.getBoundingClientRect().height - this.height - this.y
    ); // y coord is inverse from plot data
    rect.setAttribute("width", this.height);
    rect.setAttribute("height", this.height);
    rect.setAttribute("stroke", constants.colorSelected);
    rect.setAttribute("stroke-width", this.rectStrokeWidth);
    rect.setAttribute("fill", "none");
    constants.svg.appendChild(rect);
  }
}
