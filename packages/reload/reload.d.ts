export namespace Reload {
  function _onMigrate(
    cb: (
      retry: () => void,
      options: { immediateMigration?: boolean }
    ) => readonly [false] | readonly [ready: true, data?: unknown]
  ): void;
  function _onMigrate(
    name: string,
    cb: (
      retry: () => void,
      options: { immediateMigration?: boolean }
    ) => readonly [false] | readonly [ready: true, data?: unknown]
  ): void;

  function _migrationData(name: string): unknown;
}
