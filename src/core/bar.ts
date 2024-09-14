import {AbstractPlot} from './plot';
import Audio from '../engine/audio';
import {BarData, Maidr} from './maidr';
import Coordinate from './coordinate';

export default class BarPlot extends AbstractPlot {
  constructor(audio: Audio, maidr: Maidr) {
    super(audio, maidr);
  }

  protected initCoordinate(data: BarData): Coordinate {
    return new BarCoordinate(data);
  }
}

class BarCoordinate implements Coordinate {
  private readonly xLevel: number[] | string[];
  private readonly yLevel: number[] | string[];

  private readonly minX?: number;
  private readonly maxX?: number;
  private readonly minY?: number;
  private readonly maxY?: number;

  constructor(data: BarData) {
    this.xLevel = data.x;
    this.yLevel = data.y;

    if (typeof this.xLevel[0] === 'number') {
      this.minX = Math.min(...this.xLevel);
      this.maxX = Math.max(...this.xLevel);
    }
    if (typeof this.yLevel[0] === 'number') {
      this.minY = Math.min(...this.yLevel);
      this.maxY = Math.max(...this.yLevel);
    }
  }

  x(): number | string {
    return '';
  }

  y(): number | string {
    return '';
  }
}
