/**
 * Where MAIDR saves the reader's settings in the browser's local storage.
 *
 * Its own module so that a bundle reading one setting -- a diagram adapter
 * reading the reader's language -- need not import the settings service.
 */
export const SETTINGS_KEY = 'maidr-settings';
