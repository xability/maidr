import { describe, expect, it } from '@jest/globals';
import {
  DEFAULT_TACTILE_TRANSPORTS,
  formatTactilePreset,
  isTactileDisplayId,
  TACTILE_DISPLAY_PRESETS,
  tactilePresetFor,
} from '@util/tactilePreset';

/**
 * Tests for `src/util/tactilePreset.ts`, the tactile displays Settings offers.
 *
 * What a preset says about its transports decides which connect buttons the
 * reader is given and which picker opens when they pick the device, so a
 * preset naming the wrong one sends them to a picker that cannot list their
 * display.
 */
describe('tactile display presets', () => {
  it('should offer the Dot Pad X over Bluetooth and USB', () => {
    const dotPad = tactilePresetFor('dot-pad-x');

    expect(dotPad?.transports).toEqual(['bluetooth', 'serial']);
    expect(dotPad === undefined ? '' : formatTactilePreset(dotPad)).toBe('Dot Pad X — Dot Inc.');
  });

  it('should offer the Monarch over WebHID', () => {
    const monarch = tactilePresetFor('monarch');

    expect(monarch?.transports).toEqual(['hid']);
    expect(monarch === undefined ? '' : formatTactilePreset(monarch)).toBe('Monarch — APH / HumanWare');
  });

  it('should give every preset a way to connect', () => {
    expect(TACTILE_DISPLAY_PRESETS.every(preset => preset.transports.length > 0)).toBe(true);
  });

  it('should offer the Dot Pad\'s transports before a device is picked', () => {
    // The buttons a reader had before there was a choice to make.
    expect(DEFAULT_TACTILE_TRANSPORTS).toEqual(['bluetooth', 'serial']);
  });

  it('should recognise only the devices it drives', () => {
    expect(isTactileDisplayId('monarch')).toBe(true);
    expect(isTactileDisplayId('dot-pad-x')).toBe(true);
    expect(isTactileDisplayId('graphiti')).toBe(false);
    expect(isTactileDisplayId(null)).toBe(false);
    expect(tactilePresetFor(null)).toBeUndefined();
  });
});
