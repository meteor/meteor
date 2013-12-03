// autoupdate normally won't reload on server-only changes, but when
// running tests in the browser it's nice to have server changes cause
// the tests to reload.  Setting the auto update version to a
// different value when the server restarts accomplishes this.

if (Package.autoupdate)
  Package.autoupdate.Autoupdate.autoupdateVersion = Random.id();
