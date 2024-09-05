/**
 * Represents a position in 3D space.
 * @class
 */
export class Position {
  x: number;
  y: number;
  z: number;
  constructor(x = 0, y = 0, z = -1) {
    this.x = x;
    this.y = y;
    this.z = z; // rarely used
  }
}
