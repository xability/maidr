import type { CandlestickPoint } from '@model/grammar';
import type { MaidrLayer } from '@type/maidr';
import type {
  AudioState,
  BrailleState,
  HighlightState,
  TextState,
} from '@type/state';
import { BoxPlot } from '@model/box';
import { Orientation } from '@type/plot';

export class Candlestick extends BoxPlot<number | string> {
  // to reviewer: I only made these public to fix the inheritance, there may be a better way
  public min: number;
  public max: number;

  private readonly candles: CandlestickPoint[];
  private readonly candleValues: (number | string)[];

  // question for reviewer: this is how I convert from the js data[x][y], like data[0][1]
  // to the ts data[0].low. Is there a better way to do this?
  private readonly keyMap: (keyof Pick<
    CandlestickPoint,
    'low' | 'open' | 'close' | 'high'
  >)[] = ['low', 'open', 'close', 'high'];

  constructor(layer: MaidrLayer) {
    super(layer);

    this.orientation = layer.orientation ?? Orientation.VERTICAL;

    // question for reviewer: is there a way to use boxplot vars here, and still be of a different type?
    this.sections = ['low', 'open', 'close', 'high'];
    this.candles = layer.data as CandlestickPoint[];
    this.candleValues = this.candles.flatMap(point => [
      point.value,
      point.low,
      point.open,
      point.close,
      point.high,
      point.volume,
    ]);

    const flat = this.candles.flatMap(point => [
      point.low,
      point.open,
      point.close,
      point.high,
    ]);
    this.min = Math.min(...flat);
    this.max = Math.max(...flat);

    if (this.orientation === Orientation.HORIZONTAL) {
      this.row = this.candles.length - 1;
      this.col = 0;
    } else {
      this.row = 0;
      this.col = this.candles.length - 1;
    }
  }

  protected get values(): (number | string)[][] {
    return this.candles.map(candle => [
      candle.low,
      candle.open,
      candle.close,
      candle.high,
    ]);
  }

  protected get brailleValues(): string[][] {
    return [];
  }

  protected audio(): AudioState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;

    const value = isHorizontal
      ? this.candles[this.row][this.keyMap[this.col]]
      : this.candles[this.col][this.keyMap[this.row]];
    const index = isHorizontal ? this.row : this.col;
    const size = this.candles.length;

    return {
      min: this.min,
      max: this.max,
      value,
      size,
      index,
    };
  }

  protected braille(): BrailleState {
    return {
      empty: true,
      type: 'trace',
      traceType: this.type,
    };
  }

  protected highlight(): HighlightState {
    return {
      empty: true,
      type: 'trace',
      traceType: this.type,
    };
  }

  protected text(): TextState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const point = isHorizontal
      ? this.candles[this.row]
      : this.candles[this.col];

    const mainLabel = isHorizontal ? this.yAxis : this.xAxis;
    const section = isHorizontal
      ? this.sections[this.col]
      : this.sections[this.row];

    const crossLabel = isHorizontal ? this.xAxis : this.yAxis;
    const crossValue = isHorizontal
      ? this.candles[this.row][this.keyMap[this.col]]
      : this.candles[this.col][this.keyMap[this.row]];

    return {
      main: { label: mainLabel, value: point.value },
      cross: { label: crossLabel, value: crossValue },
      section,
    };
  }
}
