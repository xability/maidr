import {AbstractPlot, Orientation} from './plot';
import {AudioState, BrailleState, TextState} from './state';
import {BoxPoint, Maidr} from './grammar';

const LOWER_OUTLIER = 'Lower outlier(s)';
const UPPER_OUTLIER = 'Upper outlier(s)';

const MIN = 'Minimum';
const MAX = 'Maximum';

const Q1 = '25%';
const Q2 = '50%';
const Q3 = '75%';

export class BoxPlot extends AbstractPlot<number[] | number> {
  private readonly points: BoxPoint[];
  private readonly orientation: Orientation;

  private readonly sections: string[];
  private readonly flattenedValues: number[][];
  private readonly brailleCursor: number[][];

  private readonly min: number;
  private readonly max: number;

  constructor(maidr: Maidr) {
    super(maidr);

    this.points = maidr.data as BoxPoint[];
    this.orientation = maidr.orientation ?? Orientation.VERTICAL;

    this.sections = [LOWER_OUTLIER, MIN, Q1, Q2, Q3, MAX, UPPER_OUTLIER];
    this.values = this.points.map(point => [
      point.lowerOutliers,
      point.min,
      point.q1,
      point.q2,
      point.q3,
      point.max,
      point.upperOutliers,
    ]);

    this.flattenedValues = this.values.map(row =>
      row.flatMap(cell => (Array.isArray(cell) ? cell : [cell]))
    );
    this.min = Math.min(...this.flattenedValues.flat());
    this.max = Math.max(...this.flattenedValues.flat());

    const {braille, cursorMap} = this.toBraille(this.values);
    this.brailleValues = braille;
    this.brailleCursor = cursorMap;

    this.row =
      this.orientation === Orientation.HORIZONTAL
        ? this.values.length - 1
        : this.row;
  }

  protected audio(): AudioState {
    return {
      min: this.min,
      max: this.max,
      size: this.sections.length,
      index: this.col,
      value: this.values[this.row][this.col],
    };
  }

  protected braille(): BrailleState {
    return {
      values: this.brailleValues[this.row],
      index: this.brailleCursor[this.row][this.col],
    };
  }

  protected text(): TextState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const point = isHorizontal ? this.points[this.row] : this.points[this.col];

    const mainLabel = isHorizontal ? this.yAxis : this.xAxis;
    const crossLabel = isHorizontal ? this.xAxis : this.yAxis;
    const section = isHorizontal
      ? this.sections[this.col]
      : this.sections[this.row];

    return {
      mainLabel: mainLabel,
      mainValue: point.fill,
      crossLabel: crossLabel,
      crossValue: this.values[this.row][this.col],
      section: section,
    };
  }

  private toBraille(data: (number[] | number)[][]): {
    braille: string[][];
    cursorMap: number[][];
  } {
    const braille = [];
    const cursorMap = [];

    for (const row of data) {
      // Step 1: Calculate scaled differences for proportional distribution.
      const lengths: number[] = [];
      for (let i = 1; i < row.length; i++) {
        const current = Array.isArray(row[i])
          ? (row[i] as number[]).length > 0
            ? Math.min(...(row[i] as number[]))
            : 0
          : (row[i] as number);
        const previous = Array.isArray(row[i - 1])
          ? (row[i - 1] as number[]).length > 0
            ? Math.max(...(row[i - 1] as number[]))
            : 0
          : (row[i - 1] as number);
        const diff = Math.abs(current - previous);
        lengths.push(diff);
      }

      // Normalize lengths to a proportional distribution.
      const totalLength = lengths.reduce((sum, length) => sum + length, 0);
      const proportions = lengths.map(length =>
        totalLength > 0 ? length / totalLength : 0
      );

      // Step 2: Assign characters for each section.
      const brailleRow: string[] = [];
      const rowCursorMap: number[] = [];
      let currentPos = 0;

      const fixedCharacters = ['⠂', '⠒', '⠿', '⠸⠇', '⠿', '⠒', '⠂']; // Braille mapping for sections
      const fixedLengths = [1, 1, 1, 2, 1, 1, 1]; // Minimum length for each section

      // Total characters in the display (e.g., Braille display length = 33).
      const brailleDisplayLength = 32;

      // Offset for fixed-length sections.
      const fixedLengthSum = fixedLengths.reduce((sum, len) => sum + len, 0);
      const remainingLength = brailleDisplayLength - fixedLengthSum;

      // Proportional lengths for non-fixed sections.
      const proportionalLengths = proportions.map(p =>
        Math.round(remainingLength * p)
      );

      // Ensure at least 1 character per section where required.
      const finalLengths = fixedLengths.map(
        (len, i) => len + (proportionalLengths[i] || 0)
      );

      // Step 3: Generate Braille output row.
      row.forEach((section, index) => {
        rowCursorMap.push(currentPos);

        if (Array.isArray(section)) {
          // Handle outliers (`⠂`).
          const outlierBraille = section.map(() => '⠂').join('');
          brailleRow.push(outlierBraille);
          currentPos += outlierBraille.length;
        } else {
          // Use the fixed Braille characters for other sections.
          const brailleChar = fixedCharacters[index];
          const length = finalLengths[index];
          brailleRow.push(brailleChar.repeat(length));
          currentPos += length;
        }

        // Add spacing between sections.
        if (index < finalLengths.length - 1) {
          brailleRow.push('⠀'); // Single blank space.
          currentPos += 1;
        }
      });

      braille.push(brailleRow);
      cursorMap.push(rowCursorMap);
    }

    return {braille, cursorMap};
  }
}
