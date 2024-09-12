import { ChartType } from "../helpers/ChartType";
import { ControlManager } from "./ControlManager";
import { BarControl } from "../plots/bar/BarControl";
export class ControlFactory {
    static createDisplay(chartType: ChartType | undefined): ControlManager {
      switch (chartType) {
        case ChartType.Bar:
          return new BarControl();
        default:
          throw new Error(`Unsupported chart type: ${chartType}`);
      }
    }
  }