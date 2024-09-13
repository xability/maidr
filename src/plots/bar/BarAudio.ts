import { AudioManager } from "../../audio/AudioManager";
import { ReactivePosition } from "../../helpers/ReactivePosition";
import { slideBetween } from "../../helpers/utils";
import { BarPlot } from "./BarPlot";

export class BarAudio extends AudioManager {
  plot: BarPlot;

  constructor(plot: BarPlot, position: ReactivePosition) {
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

  override playTone(params: any): void {
    let currentDuration = this.constants.duration;
    let volume = this.constants.vol;
    if (params?.volScale) {
      volume *= params.volScale;
    }

    const rawFreq = this.plot.plotData[this.position.x];
    const rawPanning = this.position.x;
    console.log("Playing tone", this.plot.minY, this.plot.maxY, this.plot.minX,
      this.plot.maxX,);
    const frequency = slideBetween(
      rawFreq,
      this.plot.minY,
      this.plot.maxY,
      this.constants.MIN_FREQUENCY,
      this.constants.MAX_FREQUENCY
    );
    const panning = slideBetween(
      rawPanning,
      this.plot.minX,
      this.plot.maxX,
      -1,
      1
    );

    this.playOscillator(frequency, currentDuration, panning, volume, "sine");
  }
}
