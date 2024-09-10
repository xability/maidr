import { AudioManager } from "../../audio/AudioManager";
import { ReactivePosition } from "../../helpers/ReactivePosition";
import { slideBetween } from "../../helpers/utils";

export class BarAudio extends AudioManager {
  constructor(position: ReactivePosition) {
    super();
    this.position = position;
    this.position.subscribe(this.onPositionChange.bind(this));
  }

  onPositionChange(x: number, y: number, z: number): void {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
  }

  override playTone(params: any, plotData: any): void {
    let currentDuration = this.constants.duration;
    let volume = this.constants.vol;
    if (params?.volScale) {
      volume *= params.volScale;
    }

    const rawFreq = plotData[this.position.x];
    const rawPanning = this.position.x;
    const frequency = slideBetween(
      rawFreq,
      this.constants.minY,
      this.constants.maxY,
      this.constants.MIN_FREQUENCY,
      this.constants.MAX_FREQUENCY
    );
    const panning = slideBetween(
      rawPanning,
      this.constants.minX,
      this.constants.maxX,
      -1,
      1
    );

    this.playOscillator(frequency, currentDuration, panning, volume, "sine");
  }
}
