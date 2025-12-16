/**
 * Abstract utility class for platform-specific keyboard key name mappings.
 */
export abstract class Platform {
  private constructor() { /* Prevent instantiation */ }

  /**
   * Detects whether the current platform is macOS.
   */
  private static readonly IS_MAC = ((): boolean => {
    const userAgent = ((navigator as any).userAgentData?.platform ?? navigator.platform).toLowerCase();
    return userAgent.includes('mac');
  })();

  /**
   * Returns the platform-specific name for the control/command key.
   * @returns 'command' on macOS, 'ctrl' on other platforms
   */
  public static get ctrl(): string {
    return Platform.IS_MAC ? 'command' : 'ctrl';
  }

  /**
   * Returns the platform-specific name for the alt/option key.
   * @returns 'option' on macOS, 'alt' on other platforms
   */
  public static get alt(): string {
    return Platform.IS_MAC ? 'option' : 'alt';
  }

  /**
   * Returns the platform-specific name for the enter/return key.
   * @returns 'return' on macOS, 'enter' on other platforms
   */
  public static get enter(): string {
    return Platform.IS_MAC ? 'return' : 'enter';
  }
}
