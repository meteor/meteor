type RoutePolicyType = 'network' | 'static-online';

/**
 * A low-level API for declaring the route type of URL prefixes.
 */
export namespace RoutePolicy {
  export const urlPrefixTypes: Record<string, RoutePolicyType>;

  /** Check if a URL starts with the given prefix. */
  export function urlPrefixMatches(urlPrefix: string, url: string): boolean;

  /**
   * Validate a route type. Returns an error message or null.
   */
  export function checkType(type: string): string | null;

  /**
   * Validate a URL prefix. Returns an error message or null.
   */
  export function checkUrlPrefix(urlPrefix: string, type: RoutePolicyType): string | null;

  /**
   * Check if a URL prefix would conflict with static resources.
   * @param urlPrefix The URL prefix to check
   * @param type The route type
   * @param _testManifest Optional test manifest for testing
   * @returns Error message or null
   */
  export function checkForConflictWithStatic(
    urlPrefix: string,
    type: RoutePolicyType,
    _testManifest?: Array<{ type: string; where: string; url: string }>
  ): string | null;

  /**
   * Declare a URL prefix as a specific route type.
   * @throws Error if the declaration is invalid or conflicts
   */
  export function declare(urlPrefix: string, type: RoutePolicyType): void;

  /** Check whether a URL is valid (starts with '/'). */
  export function isValidUrl(url: string): boolean;

  /**
   * Classify a URL by its route type.
   * @param url The URL to classify
   * @returns The route type or null if not matched
   * @throws Error if the URL is not relative
   */
  export function classify(url: string): RoutePolicyType | null;

  /**
   * Get all URL prefixes declared for a specific type.
   * @param type The route type to filter by
   * @returns Sorted array of URL prefixes
   */
  export function urlPrefixesFor(type: RoutePolicyType): string[];
}
