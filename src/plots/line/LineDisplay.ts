import { DisplayManager } from "../../display/DisplayManager";
import { ReactivePosition } from "../../helpers/ReactivePosition";
import { LinePlot } from "./LinePlot";

export class LineDisplay extends DisplayManager {
  plot: LinePlot;
  position: ReactivePosition;

  constructor(plot: LinePlot, position: ReactivePosition) {
    super();
    this.plot = plot;
    this.position = position;
    this.position.subscribe(this.onPositionChange.bind(this));
  }

  onPositionChange(x: number, y: number, z: number): void {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
  }

  displayValues(): void {
    // line layer
    if (plot.plotLegend) {
        verboseText += plot.plotLegend.x + ' is ';
      }
      verboseText += plot.pointValuesX[position.x] + ', ';
      if (plot.plotLegend) {
        plot.plotLegend.y + ' is ';
      }
      verboseText += plot.pointValuesY[position.x];

      // terse
      terseText +=
        '<p>' +
        plot.pointValuesX[position.x] +
        ', ' +
        plot.pointValuesY[position.x] +
        '</p>\n';

      verboseText = '<p>' + verboseText + '</p>\n';
  }
  setBraille(...args: any[]): void {
    throw new Error("Method not implemented.");
  }
  updateBraillePos(): void {
    throw new Error("Method not implemented.");
  }
}
