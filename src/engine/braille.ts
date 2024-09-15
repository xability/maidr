import Coordinate from "../core/coordinate";

export default class Braille {
  private enabled: boolean

  private data;

  constructor(coordinate: Coordinate) {
    this.enabled = false;
    this.data = this.init(coordinate);
  }

  private init(coordinate: Coordinate): string[] {
    return [];
  }

  public toggle(): void {
    this.enabled = !this.enabled;
  }
}
