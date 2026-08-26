/**
 * Re-exports the standard URL and URLSearchParams globals.
 * On older browsers/environments, provides polyfills.
 */
export declare const URL: typeof globalThis.URL;
export type URL = globalThis.URL;
export declare const URLSearchParams: typeof globalThis.URLSearchParams;
export type URLSearchParams = globalThis.URLSearchParams;
