import { ChartType } from "../helpers/ChartType";
import BarDisplay from "../plots/bar/BarDisplay";
import { DisplayManager } from "./DisplayManager";

export class DisplayFactory {
  static createDisplay(chartType: ChartType | undefined): DisplayManager {
    switch (chartType) {
      case ChartType.Bar:
        return new BarDisplay();
      default:
        throw new Error(`Unsupported chart type: ${chartType}`);
    }
  }
}
