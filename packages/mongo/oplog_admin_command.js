// An admin.$cmd oplog entry for a drop / dropDatabase / create command carries
// no db-qualified namespace, so it can't be mapped to a specific collection's
// observers. (These can show up e.g. when a Percona hot-backup replays commands
// against the admin database.) Such entries are safe to ignore rather than
// crash the oplog tailer with "Unknown command"; the db-qualified versions of
// these commands still flow through the normal `<db>.$cmd` path.
//
// The `admin.$cmd` namespace is asserted here rather than relying on the caller,
// so a db-qualified `<db>.$cmd` entry (which must keep flowing through the
// normal path) can never be misclassified as ignorable.
export function isIgnorableAdminCommand(doc) {
  return !!(
    doc &&
    doc.ns === "admin.$cmd" &&
    doc.o &&
    ('drop' in doc.o || doc.o.dropDatabase || doc.o.create)
  );
}
