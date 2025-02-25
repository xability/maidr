import type { BarPoint, Maidr } from './grammar';
import type { Movable, Observable, Observer } from './interface';
import type {
  AudioState,
  AutoplayState,
  BrailleState,
  PlotState,
  TextState,
} from './state';
import { Constant } from '../util/constant';
import { MovableDirection } from './interface';

const DEFAULT_TITLE = 'MAIDR Plot';
const DEFAULT_SUBTITLE = 'unavailable';
const DEFAULT_CAPTION = 'unavailable';
const DEFAULT_X_AXIS = 'X';
const DEFAULT_Y_AXIS = 'Y';
const DEFAULT_FILL_AXIS = 'Fill';

export enum PlotType {
  BAR = 'bar',
  BOX = 'box',
  DODGED = 'dodged_bar',
  HEATMAP = 'heat',
  HISTOGRAM = 'hist',
  LINE = 'line',
  NORMALIZED = 'stacked_normalized_bar',
  STACKED = 'stacked_bar',
}

export enum Orientation {
  VERTICAL = 'vert',
  HORIZONTAL = 'horz',
}

export interface Plot extends Movable, Observable {
  id: string;
  type: string;

  title: string;
  subtitle: string;
  caption: string;

  xAxis: string;
  yAxis: string;

  get state(): PlotState;

  get hasMultiPoints(): boolean;
}

export abstract class AbstractPlot<T> implements Plot {
  private observers: Observer[];
  protected isOutOfBounds: boolean;

  public readonly id: string;
  public readonly type: string;

  public readonly title: string;
  public readonly subtitle: string;
  public readonly caption: string;

  public readonly xAxis: string;
  public readonly yAxis: string;
  protected readonly fill: string;

  public readonly selector: string;

  protected values: T[][];
  protected brailleValues: string[][];

  protected row: number;
  protected col: number;

  protected constructor(maidr: Maidr) {
    this.observers = [];

    this.id = maidr.id;
    this.type = maidr.type;

    this.title = maidr.title ?? DEFAULT_TITLE;
    this.subtitle = maidr.subtitle ?? DEFAULT_SUBTITLE;
    this.caption = maidr.caption ?? DEFAULT_CAPTION;

    this.xAxis = maidr.axes?.x ?? DEFAULT_X_AXIS;
    this.yAxis = maidr.axes?.y ?? DEFAULT_Y_AXIS;
    this.fill = maidr.axes?.fill ?? DEFAULT_FILL_AXIS;

    this.selector = maidr.selector ?? '';

    this.values = [];
    this.brailleValues = [];

    this.isOutOfBounds = true;
    this.row = -1;
    this.col = -1;
  }

  public addObserver(observer: Observer): void {
    this.observers.push(observer);
  }

  public removeObserver(observer: Observer): void {
    this.observers = this.observers.filter(obs => obs !== observer);
  }

  public notifyStateUpdate(): void {
    const currentState = this.state;
    for (const observer of this.observers) {
      observer.update(currentState);
    }
  }

  protected notifyOutOfBounds(): void {
    this.isOutOfBounds = true;
    this.notifyStateUpdate();
    if (this.row < 0 && this.col < 0) {
      this.isOutOfBounds = false;
    }
  }

  protected braille(): BrailleState {
    return {
      empty: false,
      values: this.brailleValues,
      row: this.row,
      col: this.col,
    };
  }

  public get state(): PlotState {
    if (this.isOutOfBounds) {
      return { empty: true };
    }

    return {
      empty: false,
      audio: this.audio(),
      braille: this.braille(),
      text: this.text(),
      autoplay: this.autoplay(),
    };
  }

  public moveOnce(direction: MovableDirection): void {
    // we set our movement functions to account for our -1, -1 starting position
    const movement = {
      UPWARD: () => {
        this.row += 1;
        if (this.col < 0)
          this.col = 0;
        if (this.col > this.values[this.row]?.length - 1)
          this.col = this.values[this.row].length - 1;
      },
      DOWNWARD: () => {
        this.row -= 1;
        if (this.col < 0)
          this.col = 0;
        if (this.col > this.values[this.row]?.length - 1)
          this.col = this.values[this.row].length - 1;
      },
      FORWARD: () => {
        this.col += 1;
        if (this.row < 0)
          this.row = 0;
        if (this.row > this.values.length - 1)
          this.row = this.values.length - 1;
      },
      BACKWARD: () => {
        this.col -= 1;
        if (this.row < 0)
          this.row = 0;
        if (this.row > this.values.length - 1)
          this.row = this.values.length - 1;
      },
    };

    if (this.isMovable(direction)) {
      this.isOutOfBounds = false;
      movement[direction]();
      this.notifyStateUpdate();
    } else {
      this.notifyOutOfBounds();
    }
  }

  public moveToExtreme(direction: MovableDirection): void {
    const movement = {
      UPWARD: () => {
        this.row = this.values.length - 1;
        if (this.col < 0)
          this.col = 0;
        if (this.col > this.values[this.row]?.length - 1)
          this.col = this.values[this.row].length - 1;
      },
      DOWNWARD: () => {
        this.row = 0;
        if (this.col < 0)
          this.col = 0;
        if (this.col > this.values[this.row]?.length - 1)
          this.col = this.values[this.row].length - 1;
      },
      FORWARD: () => {
        if (this.row < 0)
          this.row = 0;
        if (this.row > this.values.length - 1)
          this.row = this.values.length - 1;
        this.col = this.values[this.row].length - 1;
      },
      BACKWARD: () => {
        this.col = 0;
        if (this.row < 0)
          this.row = 0;
        if (this.row > this.values.length - 1)
          this.row = this.values.length - 1;
      },
    };

    this.isOutOfBounds = false;
    movement[direction]();
    this.notifyStateUpdate();
  }

  public moveToIndex(index: number): void {
    if (this.isMovable(index)) {
      if (this.row < 0)
        this.row = 0;
      this.col = index;
      this.isOutOfBounds = false;
      this.notifyStateUpdate();
    }
  }

  public isMovable(target: number | MovableDirection): boolean {
    switch (target) {
      case MovableDirection.UPWARD:
        return this.row < this.values.length - 1;

      case MovableDirection.DOWNWARD:
        return this.row > 0;

      case MovableDirection.FORWARD:
        // we start charts at -1-1, so we need to not break on the first move
        return (
          this.row === -1
          || this.col === -1
          || this.col < this.values[this.row].length - 1
        );

      case MovableDirection.BACKWARD:
        return this.col > 0;

      default:
        return (
          this.row >= 0
          && this.row < this.values.length
          && target >= 0
          && target < this.values[this.row].length
        );
    }
  }

  protected autoplay(): AutoplayState {
    return {
      UPWARD: this.values.length,
      DOWNWARD: this.values.length,
      FORWARD: this.values[this.row].length,
      BACKWARD: this.values[this.row].length,
    };
  }

  protected abstract audio(): AudioState;

  protected abstract text(): TextState;

  get hasMultiPoints(): boolean {
    return false;
  }
}

export abstract class AbstractBarPlot<
  T extends BarPoint,
> extends AbstractPlot<number> {
  protected readonly points: T[][];
  protected readonly orientation: Orientation;

  protected readonly min: number[];
  protected readonly max: number[];

  // visual highlighting vars
  protected activeElement: HTMLElement | undefined;
  protected activeElementColor: string | undefined;
  protected barElements: NodeListOf<HTMLElement> | undefined;

  protected constructor(maidr: Maidr, points: T[][]) {
    super(maidr);

    this.points = points;
    this.orientation = maidr.orientation ?? Orientation.VERTICAL;

    this.values = points.map(row =>
      row.map(point =>
        this.orientation === Orientation.VERTICAL
          ? Number(point.y)
          : Number(point.x),
      ),
    );
    this.min = this.values.map(row => Math.min(...row));
    this.max = this.values.map(row => Math.max(...row));

    this.brailleValues = this.toBraille(this.values);

    if (maidr.selector) {
      this.barElements = document.querySelectorAll(this.selector);
    }
  }

  public notifyStateUpdate(): void {
    super.notifyStateUpdate();
    this.Select();
  }

  protected audio(): AudioState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const size = isVertical ? this.values[0].length : this.values.length;
    const index = isVertical ? this.col : this.row;
    const value = isVertical
      ? this.values[this.row][this.col]
      : this.values[this.col][this.row];

    return {
      min: Math.min(...this.min),
      max: Math.max(...this.max),
      size,
      index,
      value,
    };
  }

  protected text(): TextState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const point = this.points[this.row][this.col];

    const mainLabel = isVertical ? this.xAxis : this.yAxis;
    const mainValue = isVertical ? point.x : point.y;

    const crossLabel = isVertical ? this.yAxis : this.xAxis;
    const crossValue = isVertical ? point.y : point.x;

    return {
      mainLabel,
      mainValue,
      crossLabel,
      crossValue,
    };
  }

  protected toBraille(data: number[][]): string[][] {
    return data.map((row, index) =>
      this.createBraille(row, this.min[index], this.max[index]),
    );
  }

  protected createBraille(data: number[], min: number, max: number): string[] {
    const braille = new Array<string>();

    const range = (max - min) / 4;
    const low = min + range;
    const medium = low + range;
    const high = medium + range;

    for (let i = 0; i < data.length; i++) {
      if (data[i] === 0) {
        braille.push(' ');
      } else if (data[i] <= low) {
        braille.push('⣀');
      } else if (data[i] <= medium) {
        braille.push('⠤');
      } else if (data[i] <= high) {
        braille.push('⠒');
      } else {
        braille.push('⠉');
      }
    }

    return braille;
  }

  /**
   * Function to convert hexadecimal color to string formatted rgb() functional notation.
   * @param hexColorString - hexadecimal color (e.g., "#595959").
   * @returns rgb() functional notation string (e.g., "rgb(100,100,100)").
   */
  ConvertHexToRGBString(hexColorString: string): string {
    return `rgb(${Number.parseInt(
      hexColorString.slice(1, 3),
      16,
    )},${Number.parseInt(hexColorString.slice(3, 5), 16)},${Number.parseInt(
      hexColorString.slice(5, 7),
      16,
    )})`;
  }

  /**
   * Function to convert an rgb() functional notation string to hexadecimal color.
   * @param rgbColorString - color in rgb() functional notation (e.g., "rgb(100,100,100)").
   * @returns hexadecimal color (e.g., "#595959").
   */
  ConvertRGBStringToHex(rgbColorString: string): string {
    const rgb: number[] = rgbColorString
      .replace(/[^\d,]/g, '')
      .split(',')
      .map(Number);
    return `#${rgb[0].toString(16).padStart(2, '0')}${rgb[1]
      .toString(16)
      .padStart(2, '0')}${rgb[2].toString(16).padStart(2, '0')}`;
  }

  /**
   * Inverts an RGB color by subtracting each color component from 255.
   *
   * @param color - The RGB color to invert, in the format "rgb(r,g,b)".
   * @return The inverted RGB color, in the format "rgb(r,g,b)".
   */
  ColorInvert(color: string): string {
    const rgb: number[] = color
      .replace(/[^\d,]/g, '')
      .split(',')
      .map(Number);
    const r: number = 255 - rgb[0];
    const g: number = 255 - rgb[1];
    const b: number = 255 - rgb[2];
    return `rgb(${r},${g},${b})`;
  }

  /**
   * Determines the best contrast color for the given color, by inverting it if necessary,
   * but if it's just a shade of gray, default to this.colorSelected.
   * @param oldColor - The color to make better
   * @returns The better color
   */
  GetBetterColor(oldColor: string): string {
    if (oldColor.includes('#')) {
      oldColor = this.ConvertHexToRGBString(oldColor);
    }
    let newColor: string = this.ColorInvert(oldColor);
    const rgb: number[] = newColor
      .replace(/[^\d,]/g, '')
      .split(',')
      .map(Number);

    if (
      rgb.length === 3 // Ensure valid RGB values
      && rgb[1] < rgb[0] + 10
      && rgb[1] > rgb[0] - 10
      && rgb[2] < rgb[0] + 10
      && rgb[2] > rgb[0] - 10
      && (rgb[0] > 86 || rgb[0] < 169)
    ) {
      // Too gray and too close to center gray, use default
      newColor = Constant.defaultElementColor;
    }

    return newColor;
  }

  /**
   * Function to parse a string containing CSS styles and return an array of strings containing CSS style attributes and values.
   * @param styleString - a string containing CSS styles in inline format.
   * @returns an array of strings containing CSS style attributes and values.
   */
  GetStyleArrayFromString(styleString: string): string[] {
    // Get an array of CSS style attributes and values from a style string
    return styleString.replaceAll(' ', '').split(/[:;]/);
  }

  /**
   * Function to parse an array of strings containing CSS style attributes and values and return a string containing CSS styles.
   * @param styleArray - an array of strings containing CSS style attributes and values.
   * @returns a string containing the CSS styles.
   */
  GetStyleStringFromArray(styleArray: string[]): string {
    // Get CSS style string from an array of style attributes and values
    let styleString = '';
    for (let i = 0; i < styleArray.length; i++) {
      if (i % 2 === 0) {
        if (i !== styleArray.length - 1) {
          styleString += `${styleArray[i]}: `;
        } else {
          styleString += styleArray[i];
        }
      } else {
        styleString += `${styleArray[i]}; `;
      }
    }
    return styleString;
  }

  /**
   * Selects the active element and changes its color.
   */
  Select(): void {
    this.UnSelectPrevious();
    if (this.barElements) {
      this.activeElement = this.barElements[this.col] as
      | HTMLElement
      | undefined;
      if (this.activeElement) {
        // Case where fill is a direct attribute
        if (this.activeElement.hasAttribute('fill')) {
          this.activeElementColor
            = this.activeElement.getAttribute('fill') || '';
          // Get new color to highlight and replace fill value
          this.activeElement.setAttribute(
            'fill',
            this.GetBetterColor(this.activeElementColor),
          );
        } else if (
          // Case where fill is within the style attribute
          this.activeElement.hasAttribute('style')
          && this.activeElement.getAttribute('style')!.includes('fill')
        ) {
          let styleString = this.activeElement.getAttribute('style')!;
          // Extract all style attributes and values
          const styleArray = this.GetStyleArrayFromString(styleString);
          const fillIndex = styleArray.indexOf('fill');

          if (fillIndex !== -1 && fillIndex + 1 < styleArray.length) {
            this.activeElementColor = styleArray[fillIndex + 1];
            // Get new color to highlight and replace fill value in style array
            styleArray[fillIndex + 1] = this.GetBetterColor(
              this.activeElementColor,
            );
            // Recreate style string and set style attribute
            styleString = this.GetStyleStringFromArray(styleArray);
            this.activeElement.setAttribute('style', styleString);
          }
        }
      }
    }
  }

  /**
   * Unselects the previously selected element by setting its fill attribute to the original color.
   */
  UnSelectPrevious(): void {
    if (this.activeElement) {
      // Set fill attribute to the original color
      if (this.activeElement.hasAttribute('fill')) {
        if (this.activeElementColor) {
          this.activeElement.setAttribute('fill', this.activeElementColor);
        }
        this.activeElement = undefined;
      } else if (
        // Case where fill is within the style attribute
        this.activeElement.hasAttribute('style')
        && this.activeElement.getAttribute('style')!.includes('fill')
      ) {
        let styleString = this.activeElement.getAttribute('style')!;
        const styleArray = this.GetStyleArrayFromString(styleString);
        const fillIndex = styleArray.indexOf('fill');

        if (fillIndex !== -1 && fillIndex + 1 < styleArray.length) {
          if (this.activeElementColor) {
            styleArray[fillIndex + 1] = this.activeElementColor;
          }
          // Recreate style string and set style attribute
          styleString = this.GetStyleStringFromArray(styleArray);
          this.activeElement.setAttribute('style', styleString);
        }
        this.activeElement = undefined;
      }
    }
  }
}
