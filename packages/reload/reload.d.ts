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

  /** All migration data saved across handlers. */
  export function _getData(): Record<string, unknown>;

  /** Attempt to migrate; `tryReload` triggers a page reload when ready. */
  export function _migrate(tryReload: boolean, options?: { immediateMigration?: boolean }): void;

  /** Reload the client program, running migration handlers first. */
  export function _reload(options?: { immediateMigration?: boolean }): void;
}
