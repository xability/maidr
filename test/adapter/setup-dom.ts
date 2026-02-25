/**
 * Minimal DOM polyfill for the Node test environment.
 *
 * The AnyChart adapter uses `instanceof HTMLElement` at runtime to distinguish
 * real DOM elements from AnyChart stage wrappers.  In Node (the default Jest
 * environment) `HTMLElement` is not a global, so we provide a stand-in before
 * the adapter module is imported.
 *
 * This file must be imported before any adapter imports in test files.
 */

if (typeof globalThis.HTMLElement === 'undefined') {
  (globalThis as any).HTMLElement = class HTMLElement {};
}
