/**
 * The text decisions behind `scripts/typedoc-seo-plugin.mjs`, kept free of
 * TypeDoc so they can be tested without a TypeDoc project.
 */

/** Longest description that still fits a search snippet. */
export const MAX_DESCRIPTION = 155;

/** Pages TypeDoc renders for the project itself rather than for a symbol. */
export const PROJECT_PAGES = {
  'index.html': {
    title: null,
    description: 'API reference for the MAIDR JavaScript library: classes, interfaces, functions and types for building accessible data visualizations.',
  },
  'hierarchy.html': {
    title: 'Class Hierarchy',
    description: 'Inheritance hierarchy of the classes and interfaces in the MAIDR JavaScript API reference.',
  },
};

/** Cut a description at a word boundary so it fits a search snippet. */
export function truncate(text) {
  if (text.length <= MAX_DESCRIPTION) {
    return text;
  }
  const cut = text.slice(0, MAX_DESCRIPTION - 3);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:]+$/, '')}...`;
}

/**
 * The description for a symbol with no doc comment: its kind, name and
 * module, so that identically named exports (every `default`, say) do not
 * all describe themselves the same way.
 */
export function fallbackDescription(kind, name, moduleName = '') {
  const location = moduleName ? ` in module ${moduleName}` : '';
  return `${kind} ${name}${location} of the MAIDR JavaScript API reference.`;
}
