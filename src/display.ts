enum DisplayMode {
  OFF = 'off',
  TERSE = 'terse',
  VERBOSE = 'verbose',
}

export default class Display {
  private mode: DisplayMode;

  constructor() {
    this.mode = DisplayMode.TERSE;
  }

  public showText(): void {
    // Show text only if turned on.
    if (this.mode === DisplayMode.OFF) {
      return;
    }
  }

  public toggle(): void {
    switch (this.mode) {
      case DisplayMode.OFF:
        this.mode = DisplayMode.TERSE;
        break;

      case DisplayMode.TERSE:
        this.mode = DisplayMode.VERBOSE;
        break;

      case DisplayMode.VERBOSE:
        this.mode = DisplayMode.OFF;
        break;
    }
  }
}
