import type { Layer } from '@type/maidr';
import type { AudioState, BrailleState, TextState } from '@type/state';
import type { BoxPoint } from './grammar';
import { Orientation } from '@type/plot';
import { AbstractTrace } from './plot';

const LOWER_OUTLIER = 'Lower outlier(s)';
const UPPER_OUTLIER = 'Upper outlier(s)';

const MIN = 'Minimum';
const MAX = 'Maximum';

const Q1 = '25%';
const Q2 = '50%';
const Q3 = '75%';

export class BoxPlot extends AbstractTrace<number[] | number> {
  private readonly points: BoxPoint[];
  private readonly boxValues: (number[] | number)[][];
  private readonly orientation: Orientation;

  private readonly sections: string[];

  private readonly min: number;
  private readonly max: number;

  constructor(maidr: Layer) {
    super(maidr);

    this.points = maidr.data as BoxPoint[];
    this.orientation = maidr.orientation ?? Orientation.VERTICAL;

    this.sections = [LOWER_OUTLIER, MIN, Q1, Q2, Q3, MAX, UPPER_OUTLIER];
    this.boxValues = this.points.map(point => [
      point.lowerOutliers,
      point.min,
      point.q1,
      point.q2,
      point.q3,
      point.max,
      point.upperOutliers,
    ]);

    const flatBoxValues = this.boxValues.map(row =>
      row.flatMap(cell => (Array.isArray(cell) ? cell : [cell])),
    );
    this.min = Math.min(...flatBoxValues.flat());
    this.max = Math.max(...flatBoxValues.flat());

    this.row = this.boxValues.length - 1;
  }

  protected get values(): (number[] | number)[][] {
    return this.boxValues;
  }

  protected audio(): AudioState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;

    const value = isHorizontal
      ? this.boxValues[this.row][this.col]
      : this.boxValues[this.col][this.row];
    const index = isHorizontal ? this.col : this.row;

    return {
      min: this.min,
      max: this.max,
      size: this.sections.length,
      index,
      value,
    };
  }

  protected braille(): BrailleState {
    return {
      empty: true,
      type: this.type,
    };
  }

  protected text(): TextState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const point = isHorizontal ? this.points[this.row] : this.points[this.col];

    const mainLabel = isHorizontal ? this.yAxis : this.xAxis;
    const section = isHorizontal
      ? this.sections[this.col]
      : this.sections[this.row];

    const crossLabel = isHorizontal ? this.xAxis : this.yAxis;
    const crossValue = isHorizontal
      ? this.boxValues[this.row][this.col]
      : this.boxValues[this.col][this.row];

    return {
      main: { label: mainLabel, value: point.fill },
      cross: { label: crossLabel, value: crossValue },
      section,
    };
  }
}
