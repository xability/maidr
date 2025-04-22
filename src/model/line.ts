import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { AudioState, TextState } from '@type/state';
import { Constant } from '@util/constant';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';

const TYPE = 'Type';
const SVG_PATH_LINE_POINT_REGEX = /[ML]\s*(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)/g;

export class LinePlot extends AbstractTrace<number> {
  private readonly points: LinePoint[][];
  private readonly lineValues: number[][];

  protected readonly brailleValues: string[][];
  protected readonly highlightValues: SVGElement[][] | null;

  private readonly min: number[];
  private readonly max: number[];

  public constructor(layer: MaidrLayer) {
    super(layer);

    this.points = layer.data as LinePoint[][];

    this.lineValues = this.points.map(row => row.map(point => Number(point.y)));
    this.min = this.lineValues.map(row => Math.min(...row));
    this.max = this.lineValues.map(row => Math.max(...row));

    this.brailleValues = this.mapToBraille(this.lineValues);
    this.highlightValues = this.mapToSvgElements(layer.selectors as string[]);
  }

  public dispose(): void {
    this.points.length = 0;

    this.min.length = 0;
    this.max.length = 0;

    super.dispose();
  }

  protected get values(): number[][] {
    return this.lineValues;
  }

  protected audio(): AudioState {
    return {
      min: this.min[this.row],
      max: this.max[this.row],
      size: this.points[this.row].length,
      index: this.col,
      value: this.points[this.row][this.col].y,
    };
  }

  protected text(): TextState {
    const point = this.points[this.row][this.col];
    const fillData = point.fill
      ? { fill: { label: TYPE, value: point.fill } }
      : {};

    return {
      main: { label: this.xAxis, value: this.points[this.row][this.col].x },
      cross: { label: this.yAxis, value: this.points[this.row][this.col].y },
      ...fillData,
    };
  }

  private mapToBraille(data: number[][]): string[][] {
    const braille = new Array<Array<string>>();

    for (let row = 0; row < data.length; row++) {
      braille.push(new Array<string>());

      const range = (this.max[row] - this.min[row]) / 4;
      const low = this.min[row] + range;
      const medium = low + range;
      const mediumHigh = medium + range;
      const high = medium + range;

      for (let col = 0; col < data[row].length; col++) {
        if (data[row][col] <= low && col - 1 >= 0 && data[row][col - 1] > low) {
          if (data[row][col - 1] <= medium) {
            braille[row].push('⢄');
          } else if (data[row][col - 1] <= mediumHigh) {
            braille[row].push('⢆');
          } else if (data[row][col - 1] > mediumHigh) {
            braille[row].push('⢇');
          }
        } else if (data[row][col] <= low) {
          braille[row].push('⣀');
        } else if (col - 1 >= 0 && data[row][col - 1] <= low) {
          if (data[row][col] <= medium) {
            braille[row].push('⡠');
          } else if (data[row][col] <= mediumHigh) {
            braille[row].push('⡰');
          } else if (data[row][col] > mediumHigh) {
            braille[row].push('⡸');
          }
        } else if (
          data[row][col] <= medium
          && col - 1 >= 0
          && data[row][col - 1] > medium
        ) {
          if (data[row][col - 1] <= mediumHigh) {
            braille[row].push('⠢');
          } else if (data[row][col - 1] > mediumHigh) {
            braille[row].push('⠣');
          }
        } else if (data[row][col] <= medium) {
          braille[row].push('⠤');
        } else if (col - 1 >= 0 && data[row][col - 1] <= medium) {
          if (data[row][col] <= mediumHigh) {
            braille[row].push('⠔');
          } else if (data[row][col] > mediumHigh) {
            braille[row].push('⠜');
          }
        } else if (
          data[row][col] <= mediumHigh
          && col - 1 >= 0
          && data[row][col - 1] > mediumHigh
        ) {
          braille[row].push('⠑');
        } else if (data[row][col] <= mediumHigh) {
          braille[row].push('⠒');
        } else if (col - 1 >= 0 && data[row][col - 1] <= mediumHigh) {
          braille[row].push('⠊');
        } else if (data[row][col] <= high) {
          braille[row].push('⠉');
        }
      }
    }

    return braille;
  }

  private mapToSvgElements(selectors?: string[]): SVGElement[][] | null {
    if (!selectors || selectors.length !== this.lineValues.length) {
      return null;
    }

    const svgElements = new Array<Array<SVGElement>>();
    for (let r = 0; r < selectors.length; r++) {
      const domElements = Svg.selectAllElements(selectors[r]);
      if (domElements.length !== 1) {
        return null;
      }

      const coordinates = new Array<LinePoint>();
      const lineElement = domElements[0];
      if (lineElement instanceof SVGPathElement) {
        const pathD = lineElement.getAttribute(Constant.D) || Constant.EMPTY;
        let match = SVG_PATH_LINE_POINT_REGEX.exec(pathD);
        while (match !== null) {
          coordinates.push({ x: Number.parseFloat(match[1]), y: Number.parseFloat(match[3]) });
          match = SVG_PATH_LINE_POINT_REGEX.exec(pathD);
        }
      } else if (lineElement instanceof SVGPolylineElement) {
        const pointsAttr = lineElement.getAttribute(Constant.POINTS) || Constant.EMPTY;
        const strCoords = pointsAttr.split(/\s+/).filter(Boolean);
        for (const coordinate of strCoords) {
          const [x, y] = coordinate.split(Constant.COMMA);
          coordinates.push({ x: Number.parseFloat(x), y: Number.parseFloat(y) });
        }
      }
      if (coordinates.length !== this.lineValues[r].length) {
        return null;
      }

      const style = window.getComputedStyle(lineElement);
      const linePointElements = new Array<SVGElement>();
      for (const coordinate of coordinates) {
        if (Number.isNaN(coordinate.x) || Number.isNaN(coordinate.y)) {
          return null;
        }
        linePointElements.push(Svg.createCircleElement(coordinate.x, coordinate.y, style, lineElement));
      }
      svgElements.push(linePointElements);
    }

    return svgElements;
  }
}
