import type { TactileService } from '@service/tactile';
import { TactileZoomInCommand, TactileZoomOutCommand } from '@command/tactile';
import { describe, expect, it, jest } from '@jest/globals';

/**
 * Whether the tactile zoom commands take Ctrl and the plus/minus keys.
 *
 * That chord is the browser's own page zoom. The reader most likely to press
 * it is a low-vision reader — one of the people this whole feature is for — and
 * MAIDR binds it inside braille mode, which is exactly where such a reader
 * spends their time. `KeybindingService` suppresses the browser default for
 * every bound key, so before this the chord was swallowed whether or not a
 * tactile display existed: with none connected the reader lost their page zoom
 * and got "No tactile display is connected" in exchange for it.
 *
 * The rule is that MAIDR holds a key the browser owns only while it can
 * actually do something with it.
 */
describe('tactile zoom claims the browser\'s zoom chord only when it can use it', () => {
  /**
   * A service that reports whether the display is live.
   * @param isActive - Whether braille is on and a display is connected
   */
  function serviceThatIs(isActive: boolean): TactileService {
    return {
      isActive,
      zoomIn: jest.fn(),
      zoomOut: jest.fn(),
    } as unknown as TactileService;
  }

  it('should take the key when a display is connected', () => {
    expect(new TactileZoomInCommand(serviceThatIs(true)).claimsKey()).toBe(true);
    expect(new TactileZoomOutCommand(serviceThatIs(true)).claimsKey()).toBe(true);
  });

  it('should leave the key to the browser when no display is connected', () => {
    expect(new TactileZoomInCommand(serviceThatIs(false)).claimsKey()).toBe(false);
    expect(new TactileZoomOutCommand(serviceThatIs(false)).claimsKey()).toBe(false);
  });

  it('should still zoom when executed', () => {
    const service = serviceThatIs(true);

    new TactileZoomInCommand(service).execute();
    new TactileZoomOutCommand(service).execute();

    expect(service.zoomIn).toHaveBeenCalledTimes(1);
    expect(service.zoomOut).toHaveBeenCalledTimes(1);
  });
});
