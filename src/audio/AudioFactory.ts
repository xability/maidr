import { ChartType } from "../helpers/ChartType";
import { AudioManager } from "./AudioManager";
import { BarAudio } from "../plots/bar/BarAudio";

export class AudioFactory {
  static createAudio(chartType: ChartType | undefined): AudioManager {
    switch (chartType) {
      case ChartType.Bar:
        return new BarAudio();
      default:
        throw new Error(`Unsupported chart type: ${chartType}`);
    }
  }
}
