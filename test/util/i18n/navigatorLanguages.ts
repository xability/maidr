/**
 * Stubs the languages `navigator` reports, for tests of anything that follows
 * the browser's language.
 *
 * Jest's node environment hands every test file in a worker the outer realm's
 * one `navigator`, so a stub left on it is seen by whichever file runs next in
 * that worker — and `Object.getOwnPropertyDescriptors` is no help for undoing
 * one: `languages` and `language` live on `Navigator.prototype`, so there is
 * no own descriptor to capture, and re-defining an empty set leaves the stub
 * in place. The restore returned here deletes the own properties instead,
 * which uncovers the prototype's getters again.
 * @param languages - What `navigator.languages` reports; `undefined` mimics a browser without the list
 * @param language - What `navigator.language` reports; the first of `languages` by default
 * @returns Puts the original values back
 */
export function stubNavigatorLanguages(
  languages: readonly string[] | undefined,
  language: string = languages?.[0] ?? '',
): () => void {
  const original = {
    languages: Object.getOwnPropertyDescriptor(navigator, 'languages'),
    language: Object.getOwnPropertyDescriptor(navigator, 'language'),
  };
  Object.defineProperty(navigator, 'languages', { value: languages, configurable: true });
  Object.defineProperty(navigator, 'language', { value: language, configurable: true });
  return () => {
    for (const key of ['languages', 'language'] as const) {
      const descriptor = original[key];
      if (descriptor) {
        Object.defineProperty(navigator, key, descriptor);
      } else {
        Reflect.deleteProperty(navigator, key);
      }
    }
  };
}
