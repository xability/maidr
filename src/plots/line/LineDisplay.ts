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
    let verboseText = '';
    let terseText = '';
    if (this.plot.plotLegend) {
        verboseText += this.plot.plotLegend.x + ' is ';
      }
      verboseText += this.plot.pointValuesX[this.position.x] + ', ';
      if (this.plot.plotLegend) {
        this.plot.plotLegend.y + ' is ';
      }
      verboseText += this.plot.pointValuesY[this.position.x];

      // terse
      terseText +=
        '<p>' +
        this.plot.pointValuesX[this.position.x] +
        ', ' +
        this.plot.pointValuesY[this.position.x] +
        '</p>\n';

      verboseText = '<p>' + verboseText + '</p>\n';
      this.displayValuesCommon("", verboseText, terseText);
  }
  setBraille(...args: any[]): void {
    throw new Error("Method not implemented.");
  }
  updateBraillePos(): void {
    throw new Error("Method not implemented.");
  }
}
