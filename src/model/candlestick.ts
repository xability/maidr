import type { CandlestickPoint, MaidrLayer } from '@type/grammar';
import type {
  AudioState,
  BrailleState,
  HighlightState,
  TextState,
} from '@type/state';
import { Orientation } from '@type/grammar';
import { AbstractTrace } from './abstract';

export class Candlestick extends AbstractTrace<number> {
  private readonly candles: CandlestickPoint[];
  private readonly candleValues: number[][];
  private readonly keyMap: (keyof Pick<
    CandlestickPoint,
    'close' | 'low' | 'high' | 'open'
  >)[] = ['close', 'low', 'high', 'open'];

  protected readonly highlightValues: SVGElement[][] | null;

  private readonly orientation: Orientation;

  private readonly sections: string[];

  private readonly min: number;
  private readonly max: number;

  constructor(layer: MaidrLayer) {
    super(layer);

    this.candles = layer.data as CandlestickPoint[];
    this.orientation = layer.orientation ?? Orientation.VERTICAL;

    // Map the candlestick data to include trend information
    this.candles = (layer.data as CandlestickPoint[]).map((candle) => ({
      ...candle,
      trend:
        candle.close > candle.open
          ? 'bull'
          : candle.close < candle.open
            ? 'bear'
            : 'neutral',
    }));

    this.sections = [...this.keyMap];

    this.candleValues = [
      this.candles.map((c) => c.open),
      this.candles.map((c) => c.high),
      this.candles.map((c) => c.low),
      this.candles.map((c) => c.close),
    ];

    this.min = Math.min(...this.candleValues.flat());
    this.max = Math.max(...this.candleValues.flat());

    if (this.orientation === Orientation.HORIZONTAL) {
      this.col = this.sections.length - 1;
      this.row = 0;
    } else {
      this.row = this.sections.length - 1;
      this.col = 0;
    }

    // todo
    this.highlightValues = null;
  }

  protected get values(): number[][] {
    return this.candleValues as number[][];
  }

  protected audio(): AudioState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;

    const value = isHorizontal
      ? this.candles[this.row][this.keyMap[this.col]]
      : this.candles[this.col][this.keyMap[this.row]];
    const index = isHorizontal ? this.row : this.col;

    return {
      min: this.min,
      max: this.max,
      size: this.candles.length,
      index,
      value,
    };
  }

  protected braille(): BrailleState {
    return {
      empty: false,
      id: this.id,
      values: this.candleValues,
      min: this.min,
      max: this.max,
      row: this.row,
      col: this.col,
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
      fill: { label: 'trend', value: point.trend },
    };
  }
}
