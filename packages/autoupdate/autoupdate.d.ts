export namespace Autoupdate {
  /** This app's id (from `APP_ID`), if set. */
  var appId: string | undefined;

  /** Target client program version; `null` until computed. */
  var autoupdateVersion: string | null;
  /** Version used to hot-refresh CSS without a full reload. */
  var autoupdateVersionRefreshable: string | null;
  /** Version served to Cordova clients. */
  var autoupdateVersionCordova: string | null;

  /**
   * (Client) Reactive data source: `true` once a newer client version is
   * available and the app should reload.
   */
  function newClientAvailable(): boolean;
}
