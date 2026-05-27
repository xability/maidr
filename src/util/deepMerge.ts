/**
 * Deep-merges `override` into `defaults`, filling any keys that are present
 * in `defaults` but absent from `override`. This ensures that newly added
 * defaults are available even when the caller supplies a partial object that
 * predates those keys (for example, an older settings object in localStorage).
 *
 * null override values are treated as absent and fall back to defaults.
 *
 * Arrays are replaced wholesale rather than recursed into. If a key holds an
 * array, a supplied override array will overwrite the default array instead of
 * being merged element-by-element.
 */
export function deepMerge<T extends object>(defaults: T, override: Partial<T>): T {
  const result = { ...defaults };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const overrideVal = override[key];
    const defaultVal = defaults[key];
    if (
      overrideVal !== null
      && overrideVal !== undefined
      && typeof overrideVal === 'object'
      && !Array.isArray(overrideVal)
      && typeof defaultVal === 'object'
      && defaultVal !== null
    ) {
      result[key] = deepMerge(defaultVal as object, overrideVal as Partial<object>) as T[keyof T];
    } else if (overrideVal !== undefined && overrideVal !== null) {
      result[key] = overrideVal as T[keyof T];
    }
  }
  return result;
}
