import type { BoxPoint, BoxSelector, MaidrLayer } from '@type/grammar';
import type { AudioState, BrailleState, TextState } from '@type/state';
import { BoxplotSection } from '@type/boxplotSection';
import { Orientation } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';

export class BoxTrace extends AbstractTrace<number[] | number> {
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

    this.sections = [
      BoxplotSection.LOWER_OUTLIER,
      BoxplotSection.MIN,
      BoxplotSection.Q1,
      BoxplotSection.Q2,
      BoxplotSection.Q3,
      BoxplotSection.MAX,
      BoxplotSection.UPPER_OUTLIER,
    ];
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
    this.min = MathUtil.minFrom2D(flatBoxValues);
    this.max = MathUtil.maxFrom2D(flatBoxValues);

    this.row = this.boxValues.length - 1;

    this.highlightValues = this.mapToSvgElements(
      layer.selectors as BoxSelector[],
    );
  }

  public dispose(): void {
    this.points.length = 0;
    this.sections.length = 0;

    super.dispose();
  }

  public moveToIndex(row: number, col: number): void {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    row = isHorizontal ? row : col;
    col = isHorizontal ? col : row;
    super.moveToIndex(row, col);
  }

  protected get values(): (number[] | number)[][] {
    return this.boxValues;
  }

  protected audio(): AudioState {
    // const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const value = this.boxValues[this.row][this.col];
    const index = Array.isArray(value)
      ? value.map(v => v - this.min)
      : value - this.min;

    return {
      min: this.min, // min freq
      max: this.max, // max freq
      value, // value, used for freq
      size: this.max - this.min, // panning size
      index, // position in panning
    };
  }

  protected braille(): BrailleState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const row = isHorizontal ? this.row : this.col;
    const col = isHorizontal ? this.col : this.row;

    return {
      empty: false,
      id: this.id,
      values: this.points,
      min: this.min,
      max: this.max,
      row,
      col,
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

  private mapToSvgElements(
    selectors: BoxSelector[],
  ): (SVGElement[] | SVGElement)[][] | null {
    if (!selectors || selectors.length !== this.points.length) {
      return null;
    }

    const isVertical = this.orientation === Orientation.VERTICAL;
    const svgElements = new Array<Array<SVGElement[] | SVGElement>>();

    if (isVertical) {
      for (let i = 0; i < this.sections.length; i++) {
        svgElements.push(Array.from({ length: selectors.length }));
      }
    }

    selectors.forEach((selector, boxIdx) => {
      const lowerOutliers = selector.lowerOutliers.flatMap(s =>
        Svg.selectAllElements(s),
      );
      const upperOutliers = selector.upperOutliers.flatMap(s =>
        Svg.selectAllElements(s),
      );

      const min = Svg.selectElement(selector.min) ?? Svg.createEmptyElement();
      const max = Svg.selectElement(selector.max) ?? Svg.createEmptyElement();

      const iq = Svg.selectElement(selector.iq) ?? Svg.createEmptyElement();
      const q2 = Svg.selectElement(selector.q2) ?? Svg.createEmptyElement();

      const [q1, q3] = isVertical
        ? [
            Svg.createLineElement(iq, 'top'),
            Svg.createLineElement(iq, 'bottom'),
          ]
        : [
            Svg.createLineElement(iq, 'left'),
            Svg.createLineElement(iq, 'right'),
          ];
      const sections = [lowerOutliers, min, q1, q2, q3, max, upperOutliers];

      if (isVertical) {
        sections.forEach((section, sectionIdx) => {
          svgElements[sectionIdx][boxIdx] = section;
        });
      } else {
        svgElements.push(sections);
      }
    });

    return svgElements;
  }
}
