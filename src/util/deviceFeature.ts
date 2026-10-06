/**
 * The browser APIs a tactile display is reached through. Each is gated by the
 * Permissions Policy feature of the same name, and is the property of
 * `navigator` of that name.
 */
export type DeviceFeature = 'bluetooth' | 'serial' | 'hid';

/**
 * Reports whether this page can use one of the browser's device APIs.
 *
 * All three are gated by Permissions Policy, and being gated out does not
 * reliably remove them: the policy has to be asked, not inferred from whether
 * the object exists. Detecting rather than assuming is what keeps a device
 * control from offering itself where it cannot work.
 *
 * @param feature - The API to test
 * @returns True when the API is there and the page may use it
 */
export function allowsDeviceFeature(feature: DeviceFeature): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  // Presence is not permission. A frame denied the feature by Permissions
  // Policy can still expose the API -- measured in Chromium, a cross-origin
  // frame without `allow` keeps `navigator.serial` and only loses
  // `navigator.bluetooth` -- so a presence check alone lets MAIDR offer a
  // control that answers with a raw SecurityError. The policy is the
  // authority where the browser will state it.
  const policy = typeof document === 'undefined'
    ? undefined
    : (document as unknown as {
        featurePolicy?: { allowsFeature: (name: string) => boolean };
      }).featurePolicy;
  if (policy !== undefined) {
    try {
      if (!policy.allowsFeature(feature)) {
        return false;
      }
    } catch {
      // A browser that does not know the feature name throws rather than
      // answering; fall through to the presence check.
    }
  }

  return feature in navigator;
}
