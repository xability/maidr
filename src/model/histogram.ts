// import {AbstractPlot, Orientation} from './plot';
// import {AudioState, TextState} from './state';
// import {HistogramPoint, Maidr} from './grammar';
//
// export class Histogram extends AbstractPlot {
//   private readonly points: HistogramPoint[];
//   private readonly orientation: Orientation;
//
//   private readonly max: number;
//   private readonly min: number;
//
//   constructor(maidr: Maidr) {
//     super(maidr);
//
//     this.points = maidr.data as HistogramPoint[];
//     this.orientation =
//       maidr.orientation === Orientation.HORIZONTAL
//         ? Orientation.HORIZONTAL
//         : Orientation.VERTICAL;
//
//     this.values = [
//       this.points.map(point =>
//         this.orientation === Orientation.VERTICAL
//           ? Number(point.y)
//           : Number(point.x)
//       ),
//     ];
//     this.min = Math.min(...this.values.flat());
//     this.max = Math.max(...this.values.flat());
//
//     this.brailleValues = this.toBraille(this.values);
//   }
//
//   protected audio(): AudioState {
//     const isVertical = this.orientation === Orientation.VERTICAL;
//     const size = isVertical ? this.values[this.row].length : this.values.length;
//     const index = isVertical ? this.col : this.row;
//     const value = isVertical
//       ? this.values[this.row][this.col]
//       : this.values[this.col][this.row];
//
//     return {
//       min: this.min,
//       max: this.max,
//       size: size,
//       index: index,
//       value: value,
//     };
//   }
//
//   protected text(): TextState {
//     const isVertical = this.orientation === Orientation.VERTICAL;
//     const point = isVertical ? this.points[this.col] : this.points[this.row];
//
//     const mainLabel = isVertical ? this.xAxis : this.yAxis;
//     const mainValue = isVertical ? point.x : point.y;
//
//     const crossLabel = isVertical ? this.yAxis : this.xAxis;
//     const crossValue = isVertical ? point.y : point.x;
//
//     const min = isVertical ? point.xmin : point.ymin;
//     const max = isVertical ? point.xmax : point.ymax;
//
//     return {
//       mainLabel,
//       mainValue,
//       min,
//       max,
//       crossLabel,
//       crossValue,
//     };
//   }
//
//   private toBraille(data: number[][]): string[][] {
//     const braille = [];
//
//     const range = (this.max - this.min) / 4;
//     const low = this.min + range;
//     const medium = low + range;
//     const high = medium + range;
//
//     for (let row = 0; row < data.length; row++) {
//       braille.push(new Array<string>());
//
//       for (let col = 0; col < data[row].length; col++) {
//         if (data[row][col] === 0) {
//           braille[row].push(' ');
//         } else if (data[row][col] <= low) {
//           braille[row].push('⣀');
//         } else if (data[row][col] <= medium) {
//           braille[row].push('⠤');
//         } else if (data[row][col] <= high) {
//           braille[row].push('⠒');
//         } else {
//           braille[row].push('⠉');
//         }
//       }
//     }
//
//     return braille;
//   }
// }

import {AbstractBarPlot, Orientation} from './plot';
import {HistogramPoint, Maidr} from './grammar';

export class Histogram extends AbstractBarPlot<HistogramPoint> {
  constructor(maidr: Maidr) {
    super(maidr, maidr.data as HistogramPoint[]);
  }

  protected toValues(points: HistogramPoint[]): number[][] {
    return [
      points.map(point =>
        this.orientation === Orientation.VERTICAL
          ? Number(point.y)
          : Number(point.x)
      ),
    ];
  }
}
