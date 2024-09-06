import { AudioManager } from './AudioManager';
import { slideBetween } from '../helpers/utils';

export class BarPlotAudio extends AudioManager {
    constructor() {
      super();
    }
    public playTone(params: any,plotData: any): void {
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
  
      this.playOscillator(frequency, currentDuration, panning, volume, 'sine');
    }
  }