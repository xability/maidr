import {AbstractPlot} from './plot';
import {LineData, Maidr} from './maidr';
import Coordinate from './coordinate';

export default class LinePlot extends AbstractPlot {
  constructor(maidr: Maidr) {
    super(maidr);
  }

  protected initCoordinate(data: LineData): Coordinate {
    return new LineCoordinate();
  }
}

class LineCoordinate implements Coordinate {
  x(): number | string {
    return '';
  }

  y(): number | string {
    return '';
  }
}
