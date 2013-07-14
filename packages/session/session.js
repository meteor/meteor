var migratedKeys = {};
if (Meteor._reload) {
  var migrationData = Meteor._reload.migrationData('session');
  if (migrationData && migrationData.keys) {
    migratedKeys = migrationData.keys;
  }
}

// @export Session
Session = new ReactiveDict(migratedKeys);

if (Meteor._reload) {
  Meteor._reload.onMigrate('session', function () {
    return [true, {keys: Session.keys}];
  });
}
