/**
 * Re-exports the standard URL and URLSearchParams globals.
 * On older browsers/environments, provides polyfills.
 */
export var URL: typeof globalThis.URL;
export var URLSearchParams: typeof globalThis.URLSearchParams;
