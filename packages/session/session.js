var migratedKeys = {};
if (Package.reload) {
  var migrationData = Package.reload.Reload._migrationData('session');
  if (migrationData && migrationData.keys) {
    migratedKeys = migrationData.keys;
  }
}

Session = new ReactiveDict(migratedKeys);

if (Package.reload) {
  Package.reload.Reload._onMigrate('session', function () {
    return [true, {keys: Session.keys}];
  });
}
