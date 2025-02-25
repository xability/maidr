import type { HeatmapData, Maidr } from './grammar';
import type { AudioState, TextState } from './state';
import { Constant } from '../util/constant';
import { AbstractPlot } from './plot';

export class Heatmap extends AbstractPlot<number> {
  private readonly x: string[];
  private readonly y: string[];

  private readonly min: number;
  private readonly max: number;

  private squareIndex: number;
  private rectStrokeWidth: number;
  private rectHeight: number;
  private rectWidth: number;
  private hasRect: boolean;
  private x_coord: number[];
  private y_coord: number[];
  protected elements: NodeListOf<Element> | undefined;

  public constructor(maidr: Maidr) {
    super(maidr);

    const data = maidr.data as HeatmapData;
    this.x = data.x;
    this.y = data.y;

    this.values = data.points;
    this.min = Math.min(...this.values.flat());
    this.max = Math.max(...this.values.flat());

    this.row = this.values.length - 1;
    this.brailleValues = this.toBraille(this.values);

    // rect stuff
    if (maidr.selector) {
      this.elements = document.querySelectorAll(maidr.selector);
      this.hasRect = true;
    } else {
      this.hasRect = false;
    }
    if (this.hasRect) {
      this.squareIndex = 0;
      this.rectStrokeWidth = 4; // px
      const recData = this.SetHeatmapRectData();
      this.x_coord = recData[0];
      this.y_coord = recData[1];
      this.rectHeight = Math.abs(
        Number(this.y_coord[1]) - Number(this.y_coord[0]),
      );
      this.rectWidth = Math.abs(
        Number(this.x_coord[1]) - Number(this.x_coord[0]),
      );
    } else {
      this.squareIndex = 0;
      this.rectStrokeWidth = 4;
      this.rectHeight = 0;
      this.rectWidth = 0;
      this.x_coord = [];
      this.y_coord = [];
    }
  }

  public notifyStateUpdate(): void {
    super.notifyStateUpdate();
    if (this.hasRect && !this.isOutOfBounds) {
      this.UpdateRectDisplay();
    }
  }

  protected audio(): AudioState {
    return {
      min: this.min,
      max: this.max,
      size: this.values.length,
      index: this.col,
      value: this.values[this.row][this.col],
    };
  }

  protected text(): TextState {
    return {
      mainLabel: this.xAxis,
      mainValue: this.x[this.col],
      crossLabel: this.yAxis,
      crossValue: this.y[this.row],
      fillLabel: this.fill,
      fillValue: String(this.values[this.row][this.col]),
    };
  }

  private toBraille(data: number[][]): string[][] {
    const braille = new Array<Array<string>>();

    const range = (this.max - this.min) / 3;
    const low = this.min + range;
    const medium = low + range;

    for (let row = 0; row < data.length; row++) {
      braille.push(new Array<string>());

      for (let col = 0; col < data[row].length; col++) {
        if (data[row][col] === 0) {
          braille[row].push(' ');
        } else if (data[row][col] <= low) {
          braille[row].push('⠤');
        } else if (data[row][col] <= medium) {
          braille[row].push('⠒');
        } else {
          braille[row].push('⠉');
        }
      }
    }

    return braille;
  }

  /**
   * Returns an array of heatmap data containing unique x and y coordinates.
   * If 'data' exists in singleMaidr, it returns the norms from the data.
   * Otherwise, it calculates the norms from the unique x and y coordinates.
   */
  SetHeatmapRectData(): number[][] {
    if (!this.elements || !this.elements.length) {
      return [[], []];
    }

    const xCoords: number[] = [];
    const yCoords: number[] = [];

    this.elements.forEach((element) => {
      if (!element)
        return;

      if (element instanceof SVGPathElement) {
        const coords = this.ExtractPathCoordinates(element);
        if (coords) {
          xCoords.push(coords.x);
          yCoords.push(coords.y);
        }
      } else {
        const x = element.getAttribute('x');
        const y = element.getAttribute('y');
        if (x !== null && y !== null) {
          xCoords.push(Number.parseFloat(x));
          yCoords.push(Number.parseFloat(y));
        }
      }
    });

    // return sorted unique values
    const sortedCoords = this.SortAndScaleCoordinates(xCoords, yCoords);
    return [[...new Set(sortedCoords[0])], [...new Set(sortedCoords[1])]];
  }

  /**
   * Extracts x and y coordinates from an SVG path element.
   */
  private ExtractPathCoordinates(
    element: SVGPathElement,
  ): { x: number; y: number } | null {
    const pathData = element.getAttribute('d');
    if (!pathData)
      return null;

    const regex = /[ML]\s*-?\d+(?:\.\d*)?\s+-?\d+\.?\d*/;
    const match = regex.exec(pathData);
    if (!match)
      return null;

    return {
      x: Number.parseFloat(match[1]),
      y: Number.parseFloat(match[3]),
    };
  }

  /**
   * Sorts and applies scaling transformations to x and y coordinates.
   */
  private SortAndScaleCoordinates(
    xCoords: number[],
    yCoords: number[],
  ): number[][] {
    xCoords.sort((a, b) => a - b);
    yCoords.sort((a, b) => a - b);

    const [scaleX, scaleY] = this.GetSVGScaler();
    if (scaleX === -1)
      xCoords.reverse();
    if (scaleY === -1)
      yCoords.reverse();

    return [xCoords, yCoords];
  }

  /**
   * Returns an array containing the X and Y scales of the first SVG element found in the elements array.
   * @returns A tuple `[scaleX, scaleY]` representing the scale of the SVG element.
   */
  GetSVGScaler(): [number, number] {
    let scaleX = 1;
    let scaleY = 1;

    // Check if the element is inside an SVG that can be scaled
    const firstElement = this.elements ? this.elements[0] : null;
    if (!firstElement)
      return [scaleX, scaleY];

    if (!this.IsInsideSVG(firstElement))
      return [scaleX, scaleY];

    // Traverse up the DOM tree to check for scale transformations
    let element: Node | null = firstElement;
    while (
      element
      && element instanceof HTMLElement
      && element.tagName.toLowerCase() !== 'body'
    ) {
      const transform = element.getAttribute('transform');
      if (transform) {
        const match = transform.match(
          /scale\((-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)\)/,
        );
        if (match) {
          scaleX *= Number.parseFloat(match[1]) || 1;
          scaleY *= Number.parseFloat(match[3]) || 1;
        }
      }
      element = element.parentNode;
    }

    return [scaleX, scaleY];
  }

  /**
   * Checks if the given element is inside an SVG that supports scaling.
   */
  private IsInsideSVG(element: Node): boolean {
    while (element && element instanceof HTMLElement) {
      if (element.tagName.toLowerCase() === 'svg')
        return true;
      if (element.tagName.toLowerCase() === 'body')
        break;
      element = element.parentNode as Node;
    }
    return false;
  }

  /**
   * Updates the rectangle display.
   */
  UpdateRectDisplay(): void {
    const existingRect = document.getElementById('highlight_rect');
    if (existingRect)
      existingRect.remove(); // Destroy and recreate

    const svgns = 'http://www.w3.org/2000/svg';
    const rect = document.createElementNS(svgns, 'rect');
    rect.setAttribute('id', 'highlight_rect');
    rect.setAttribute('x', String(this.x_coord[this.col]));
    rect.setAttribute(
      'y',
      String(this.y_coord[this.y_coord.length - 1 - this.row]),
    );
    rect.setAttribute('width', String(this.rectWidth));
    rect.setAttribute('height', String(this.rectHeight));
    rect.setAttribute('stroke', Constant.defaultElementColor);
    rect.setAttribute('stroke-width', String(this.rectStrokeWidth));
    rect.setAttribute('fill', 'none');

    const parentElement = this.elements
      ? this.elements[this.squareIndex]?.parentNode
      : null;
    if (parentElement) {
      parentElement.appendChild(rect);
    }
  }
}
