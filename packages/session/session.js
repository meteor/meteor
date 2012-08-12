// XXX could use some tests

Session = new ReactiveDict();


if (Meteor._reload) {
  Meteor._reload.on_migrate('session', function () {
    // XXX sanitize and make sure it's JSONible?
    return [true, Session.toJSON()];
  });

  (function () {
    var migration_data = Meteor._reload.migration_data('session');
    if (migration_data) {
      Session = new ReactiveDict(migration_data)
    }
  })();
}
