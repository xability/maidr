import { Plot } from "./plot";

export class BarPlot extends Plot {
  maxY: number = 0;
  maxX: number = 0;
  minY: number = 0;
  minX: number = 0;
  plotData: any;
}
