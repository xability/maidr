import { Constants } from "../constants";
import { LinePlot } from "../plots/line/LinePlot";

export class Point {
    x: string;
    y: string;
    plot: LinePlot;
    constants: Constants;
    /**
     * Creates a new instance of Point.
     * @constructor
     */
    constructor(plot: LinePlot, x: number, y: number) {
      this.x = x.toString()
      this.y = y.toString()
      this.constants = window.constants;
        this.plot = plot;
    }
  
    /**
     * Clears the existing points and updates the x and y coordinates for the chart line.
     * @async
     * @returns {Promise<void>}
     */
    async updatePoints() {
      await this.clearPoints();
      this.x = this.plot.chartLineX[this.plot.position.x];
      this.y = this.plot.chartLineY[this.plot.position.x];
    }
  
    /**
     * Clears existing points, updates the points, and prints a new point on the chart.
     * @async
     * @returns {Promise<void>}
     */
    async printPoints() {
      await this.clearPoints();
      await this.updatePoints();
      const svgns = 'http://www.w3.org/2000/svg';
      var point = document.createElementNS(svgns, 'circle');
      point.setAttribute('id', 'highlight_point');
      point.setAttribute('cx', this.x);
      point.setAttribute('cy', this.y);
      point.setAttribute('r', "1.75");
      point.setAttribute(
        'style',
        'fill:' + this.constants.colorSelected + ';stroke:' + this.constants.colorSelected
      );
      this.constants.chart?.appendChild(point);
    }
  
    /**
     * Removes all highlighted points from the line plot.
     * @async
     */
    async clearPoints() {
      let points = document.getElementsByClassName('highlight_point');
      for (let i = 0; i < points.length; i++) {
        document.getElementsByClassName('highlight_point')[i].remove();
      }
      if (document.getElementById('highlight_point'))
        document.getElementById('highlight_point')?.remove();
    }
  
    /**
     * Clears the points, updates them, and prints them to the display.
     */
    updatePointDisplay() {
      this.clearPoints();
      this.updatePoints();
      this.printPoints();
    }
  }
  