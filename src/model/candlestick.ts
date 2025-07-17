import type { CandlestickPoint, MaidrLayer } from '@type/grammar';
import type { AudioState, BrailleState, TextState } from '@type/state';
import { AbstractTrace } from '@model/abstract';
import { Orientation } from '@type/grammar';

const TREND = 'Trend';
const SECTIONS = ['close', 'low', 'high', 'open'] as const;

export class Candlestick extends AbstractTrace<number> {
  private readonly candles: CandlestickPoint[];
  private readonly candleValues: number[][];

  private readonly orientation: Orientation;
  private readonly sections: typeof SECTIONS;

  private readonly min: number;
  private readonly max: number;

  constructor(layer: MaidrLayer) {
    super(layer);

    const data = layer.data as CandlestickPoint[];
    this.candles = data.map(candle => ({
      ...candle,
      trend: candle.close > candle.open
        ? 'Bull'
        : candle.close < candle.open ? 'Bear' : 'Neutral',
    }));

    this.orientation = layer.orientation ?? Orientation.VERTICAL;
    this.sections = SECTIONS;

    this.candleValues = this.sections.map(key =>
      this.candles.map(c => c[key]),
    );

    this.min = Math.min(...this.candleValues.flat());
    this.max = Math.max(...this.candleValues.flat());

    if (this.orientation === Orientation.HORIZONTAL) {
      this.col = this.sections.length - 1;
    } else {
      this.row = this.sections.length - 1;
    }
  }

  public dispose(): void {
    this.candles.length = 0;
    super.dispose();
  }

  protected get values(): number[][] {
    return this.candleValues;
  }

  protected audio(): AudioState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const index = isHorizontal ? this.row : this.col;
    const valueKey = this.sections[isHorizontal ? this.col : this.row];
    const value = this.candles[index][valueKey];

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

  protected get highlightValues(): null {
    return null;
  }

  protected text(): TextState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const point = isHorizontal ? this.candles[this.row] : this.candles[this.col];

    const mainLabel = isHorizontal ? this.yAxis : this.xAxis;
    const section = isHorizontal ? this.sections[this.col] : this.sections[this.row];

    const crossLabel = isHorizontal ? this.xAxis : this.yAxis;
    const crossValue = isHorizontal ? point[this.sections[this.col]] : point[this.sections[this.row]];

    return {
      main: { label: mainLabel, value: point.value },
      cross: { label: crossLabel, value: crossValue },
      section,
      fill: { label: TREND, value: point.trend },
    };
  }
}
