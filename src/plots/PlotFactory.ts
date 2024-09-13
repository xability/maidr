import { ChartType } from "../helpers/ChartType";
import { BarPlot } from "./bar/BarPlot";
import { Plot } from "./Plot";
export class PlotFactory {
  static createPlot(chartType: ChartType | undefined, maidr: any): Plot {
    switch (chartType) {
      case ChartType.Bar:
        return new BarPlot(maidr);
      default:
        throw new Error(`Unsupported chart type: ${chartType}`);
    }
  }
}
