export abstract class Platform {
  private constructor() { /* Prevent instantiation */ }

  private static readonly IS_MAC = ((): boolean => {
    const userAgent = ((navigator as any).userAgentData?.platform ?? navigator.platform).toLowerCase();
    return userAgent.includes('mac');
  })();

  public static get ctrl(): string {
    return Platform.IS_MAC ? 'command' : 'ctrl';
  }

  public static get alt(): string {
    return Platform.IS_MAC ? 'option' : 'alt';
  }

  public static get enter(): string {
    return Platform.IS_MAC ? 'return' : 'enter';
  }
}
