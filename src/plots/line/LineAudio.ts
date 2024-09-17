import { AudioManager } from "../../audio/AudioManager";
import { ReactivePosition } from "../../helpers/ReactivePosition";
import { slideBetween } from "../../helpers/utils";
import { LinePlot } from "./LinePlot";

export class LineAudio extends AudioManager {
    plot: LinePlot;

    constructor(plot: LinePlot, position: ReactivePosition) {
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
  playTone(params: any): void {
    let currentDuration = this.constants.duration;
    let volume = this.constants.vol;
    if (params?.volScale) {
      volume *= params.volScale;
    }
    const rawFreq = this.plot.pointValuesY[this.position.x];
    const rawPanning = this.position.x;
   
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
