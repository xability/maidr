import {AbstractPlot, Orientation} from './plot';
import {BarData, Maidr} from './maidr';
import Coordinate from './coordinate';

export default class BarPlot extends AbstractPlot {
  constructor(maidr: Maidr) {
    super(maidr);
  }

  protected initCoordinate(data: BarData): Coordinate {
    return new BarCoordinate(data, this.orientation);
  }
}

class BarCoordinate implements Coordinate {
  private readonly main: number[];
  private readonly cross: number[] | string[];

  private readonly min: number;
  private readonly max: number;

  public index: number;

  constructor(data: BarData, orientation: Orientation) {
    if (data.x.length !== data.y.length) {
      throw new Error(
        `len(x): ${data.x.length} and len(y): ${data.y.length} do not match`
      );
    }

    this.index = 0;

    if (orientation === Orientation.VERTICAL) {
      this.main = data.x as number[];
      this.cross = data.y;
    } else {
      this.main = data.y as number[];
      this.cross = data.x;
    }

    this.min = Math.min(...this.main);
    this.max = Math.min(...this.main);
  }

  x(): number | string {
    return '';
  }

  y(): number | string {
    return '';
  }
}
