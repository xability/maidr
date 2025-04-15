export abstract class Platform {
  private constructor() { /* Prevent instantiation */ }

  private static readonly IS_MAC = ((): boolean => {
    const userAgent = ((navigator as any).userAgentData?.platform ?? navigator.platform).toLowerCase();
    return userAgent.includes('mac');
  })();

  public static get modifierKey(): string {
    return Platform.IS_MAC ? 'command' : 'ctrl';
  }

  public static get altModifierKey(): string {
    return Platform.IS_MAC ? 'option' : 'alt';
  }

  public static get enterKey(): string {
    return Platform.IS_MAC ? 'return' : 'enter';
  }
}
