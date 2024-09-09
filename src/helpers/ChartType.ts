export enum ChartType {
  Bar = "bar",
  Hist = "hist",
  Heat = "heat",
  Line = "line",
  Box = "box",
  Scatter = "scatter",
  StackedBar = "stacked_bar",
  StackedNormalizedBar = "stacked_normalized_bar",
  DodgedBar = "dodged_bar",
}

export function convertToChartType(type: string): ChartType | undefined {
  switch (type) {
    case "bar":
      return ChartType.Bar;
    case "hist":
      return ChartType.Hist;
    case "heat":
      return ChartType.Heat;
    case "line":
      return ChartType.Line;
    case "box":
      return ChartType.Box;
    case "scatter":
      return ChartType.Scatter;
    case "stacked_bar":
      return ChartType.StackedBar;
    case "stacked_normalized_bar":
      return ChartType.StackedNormalizedBar;
    case "dodged_bar":
      return ChartType.DodgedBar;
    default:
      return undefined;
  }
}
