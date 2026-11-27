import { isIgnorableAdminCommand } from '../oplog_admin_command';
import { handleDoc } from '../oplog_tailing';

Tinytest.add('mongo-livedata - oplog - isIgnorableAdminCommand', function (test) {
  // admin.$cmd entries with no db-qualified namespace: safe to ignore.
  test.isTrue(isIgnorableAdminCommand({ ns: 'admin.$cmd', o: { drop: 'somecollection' } }));
  test.isTrue(isIgnorableAdminCommand({ ns: 'admin.$cmd', o: { dropDatabase: 1 } }));
  test.isTrue(isIgnorableAdminCommand({ ns: 'admin.$cmd', o: { create: 'somecollection' } }));

  // Not ignorable: transactions (handled elsewhere), and anything else.
  test.isFalse(isIgnorableAdminCommand({ ns: 'admin.$cmd', o: { applyOps: [] } }));
  test.isFalse(isIgnorableAdminCommand({ ns: 'admin.$cmd', o: {} }));
  test.isFalse(isIgnorableAdminCommand({}));
  test.isFalse(isIgnorableAdminCommand(null));

  // A db-qualified `<db>.$cmd` entry must NOT be treated as ignorable; those
  // still carry a mappable collection and flow through the normal path.
  test.isFalse(isIgnorableAdminCommand({ ns: 'mydb.$cmd', o: { drop: 'somecollection' } }));
  test.isFalse(isIgnorableAdminCommand({ ns: 'mydb.$cmd', o: { create: 'somecollection' } }));
});

Tinytest.addAsync(
  'mongo-livedata - oplog - handleDoc skips ignorable admin.$cmd entries',
  async function (test) {
    // Drive the real oplog handler for the admin.$cmd path that used to crash
    // the tailer with "Unknown command" (#12727). The handle is unused on this
    // path, so a stub is enough to exercise the early return.
    const ignorable = [
      { ns: 'admin.$cmd', o: { drop: 'somecollection' } },
      { ns: 'admin.$cmd', o: { dropDatabase: 1 } },
      { ns: 'admin.$cmd', o: { create: 'somecollection' } },
    ];
    for (const doc of ignorable) {
      test.equal(await handleDoc({}, doc), undefined);
    }

    // A genuinely unknown admin command must still throw so we don't silently
    // swallow oplog entries we don't understand.
    let threw = false;
    try {
      await handleDoc({}, { ns: 'admin.$cmd', o: { renameCollection: 'x' } });
    } catch (e) {
      threw = true;
      test.matches(e.message, /Unknown command/);
    }
    test.isTrue(threw, 'unknown admin.$cmd command should throw');
  }
);
