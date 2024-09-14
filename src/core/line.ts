import {AbstractPlot} from './plot';
import Audio from '../engine/audio';
import {LineData, Maidr} from './maidr';
import Coordinate from './coordinate';

export default class LinePlot extends AbstractPlot {
  constructor(audio: Audio, maidr: Maidr) {
    super(audio, maidr);
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
