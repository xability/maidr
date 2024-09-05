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

export function slideBetween(val: number, a: number, b: number, min: number, max: number): number {
  val = Number(val);
  a = Number(a);
  b = Number(b);
  min = Number(min);
  max = Number(max);
  
  let newVal = ((val - a) / (b - a)) * (max - min) + min;
  
  if (a === 0 && b === 0) {
    newVal = 0;
  }
  
  return newVal;
}
