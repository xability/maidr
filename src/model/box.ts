import type { BoxPoint, BoxSelector, MaidrLayer } from '@type/grammar';
import type { AudioState, TextState } from '@type/state';
import { Orientation } from '@type/grammar';
import { AbstractTrace } from './abstract';

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

  protected readonly highlightValues: (SVGElement[] | SVGElement)[][] | null;

  private readonly orientation: Orientation;
  private readonly sections: string[];

  private readonly min: number;
  private readonly max: number;

  constructor(layer: MaidrLayer) {
    super(layer);

    this.points = layer.data as BoxPoint[];
    this.orientation = layer.orientation ?? Orientation.VERTICAL;

    this.sections = [LOWER_OUTLIER, MIN, Q1, Q2, Q3, MAX, UPPER_OUTLIER];
    const sectionAccessors = [
      (p: BoxPoint) => p.lowerOutliers,
      (p: BoxPoint) => p.min,
      (p: BoxPoint) => p.q1,
      (p: BoxPoint) => p.q2,
      (p: BoxPoint) => p.q3,
      (p: BoxPoint) => p.max,
      (p: BoxPoint) => p.upperOutliers,
    ];
    if (this.orientation === Orientation.HORIZONTAL) {
      this.boxValues = this.points.map(point =>
        sectionAccessors.map(accessor => accessor(point)),
      );
    } else {
      this.boxValues = sectionAccessors.map(accessor =>
        this.points.map(point => accessor(point)),
      );
    }

    const flatBoxValues = this.boxValues.map(row =>
      row.flatMap(cell => (Array.isArray(cell) ? cell : [cell])),
    );
    this.min = Math.min(...flatBoxValues.flat());
    this.max = Math.max(...flatBoxValues.flat());

    this.row = this.boxValues.length - 1;

    this.highlightValues = this.mapToSvgElements(layer.selectors as BoxSelector[]);
  }

  public dispose(): void {
    this.points.length = 0;
    this.boxValues.length = 0;

    this.sections.length = 0;

    super.dispose();
  }

  protected get values(): (number[] | number)[][] {
    return this.boxValues;
  }

  protected get brailleValues(): null {
    return null;
  }

  protected audio(): AudioState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const value = this.boxValues[this.row][this.col];
    const size = isHorizontal ? this.sections.length : this.points.length;
    const index = isHorizontal ? this.col : this.col;

    return {
      min: this.min,
      max: this.max,
      size,
      index,
      value,
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
    const crossValue = this.boxValues[this.row][this.col];

    return {
      main: { label: mainLabel, value: point.fill },
      cross: { label: crossLabel, value: crossValue },
      section,
    };
  }

  private mapToSvgElements(selectors: BoxSelector[]): (SVGElement[] | SVGElement)[][] | null {
    if (!selectors || selectors.length !== this.points.length) {
      return null;
    }
    return null;
  }
}
