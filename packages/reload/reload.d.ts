export namespace Reload {
  /**
   * A migration handler. Receives a `retry` callback and returns
   * `[readyToMigrate, data?]`; returning `false` blocks the reload until
   * `retry` is called.
   */
  type MigrationCallback = (retry: () => void) => [boolean, unknown?];

  /** Register a migration handler, optionally under a named key. */
  export function _onMigrate(callback: MigrationCallback): void;
  export function _onMigrate(name: string, callback: MigrationCallback): void;

  /** Data saved by the named migration handler on the previous reload. */
  export function _migrationData(name: string): unknown;

  /** The raw serialized migration data from sessionStorage (JSON string), or null. */
  export function _getData(): string | null;

  /**
   * Attempt to migrate; `tryReload` is the retry callback handed to migration
   * handlers. Returns `false` if some provider isn't ready yet, `true` if migrated.
   */
  export function _migrate(tryReload: () => void, options?: { immediateMigration?: boolean }): boolean;

  /** Reload the client program, running migration handlers first. */
  export function _reload(options?: { immediateMigration?: boolean }): void;
}
