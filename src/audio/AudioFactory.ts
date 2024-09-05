import { ChartType } from "../helpers/chart_type";
import { AudioManager } from "./AudioManager";
import { BarPlotAudio } from "./BarPlotAudio";

export class AudioFactory {
    static createAudio(chartType: ChartType): AudioManager {
      switch (chartType) {
        case ChartType.Bar:
          return new BarPlotAudio();
        default:
          throw new Error(`Unsupported chart type: ${chartType}`);
      }
    }
  }