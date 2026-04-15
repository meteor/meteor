interface ManifestResource {
  type: string;
  where: string;
  path: string;
  hash: string;
  url?: string;
  replaceable?: boolean;
}

export namespace WebAppHashing {
  /**
   * Calculate a hash of all the client resources downloaded by the browser.
   * @param manifest Array of resource manifest entries
   * @param includeFilter Optional filter function to select resources
   * @param runtimeConfigOverride Optional override for runtime config in the hash
   * @returns A hex-encoded SHA-1 hash string
   */
  export function calculateClientHash(
    manifest: ManifestResource[],
    includeFilter?: (type: string, replaceable?: boolean) => boolean,
    runtimeConfigOverride?: Record<string, unknown>
  ): string;

  /**
   * Calculate a hash for Cordova compatibility checking.
   * @param platformVersion The Cordova platform version
   * @param pluginVersions A map of plugin names to versions
   * @returns A hex-encoded SHA-1 hash string
   */
  export function calculateCordovaCompatibilityHash(
    platformVersion: string,
    pluginVersions: Record<string, string>
  ): string;
}
