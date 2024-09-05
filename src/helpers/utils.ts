import { ChartType } from "./chart_type";
import BarDisplay from "../display/bar_display";
import { Display } from "../display/display";

export function getDisplayFromChartType(
  chartType: ChartType | undefined
): Display | null {
  switch (chartType) {
    case ChartType.Bar:
      return new BarDisplay();
    default:
      return null;
  }
}
