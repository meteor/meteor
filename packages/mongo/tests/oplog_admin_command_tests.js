import { isIgnorableAdminCommand } from '../oplog_admin_command';

Tinytest.add('mongo-livedata - oplog - isIgnorableAdminCommand', function (test) {
  // admin.$cmd entries with no db-qualified namespace: safe to ignore.
  test.isTrue(isIgnorableAdminCommand({ o: { drop: 'somecollection' } }));
  test.isTrue(isIgnorableAdminCommand({ o: { dropDatabase: 1 } }));
  test.isTrue(isIgnorableAdminCommand({ o: { create: 'somecollection' } }));

  // Not ignorable: transactions (handled elsewhere), and anything else.
  test.isFalse(isIgnorableAdminCommand({ o: { applyOps: [] } }));
  test.isFalse(isIgnorableAdminCommand({ o: {} }));
  test.isFalse(isIgnorableAdminCommand({}));
  test.isFalse(isIgnorableAdminCommand(null));
});
