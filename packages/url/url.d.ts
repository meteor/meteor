/**
 * Re-exports the standard URL and URLSearchParams globals.
 * On older browsers/environments, provides polyfills.
 */
export interface URLHelpers {
  _constructUrl(
    url: string,
    query?: string | null,
    params?: Record<string, unknown>
  ): string;
  _encodeParams(params: Record<string, unknown>, prefix?: string): string;
}

export declare const URL: typeof globalThis.URL & URLHelpers;
export type URL = globalThis.URL;
export declare const URLSearchParams: typeof globalThis.URLSearchParams;
export type URLSearchParams = globalThis.URLSearchParams;
