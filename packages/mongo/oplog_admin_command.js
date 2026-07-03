// An admin.$cmd oplog entry for a drop / dropDatabase / create command carries
// no db-qualified namespace, so it can't be mapped to a specific collection's
// observers. (These can show up e.g. when a Percona hot-backup replays commands
// against the admin database.) Such entries are safe to ignore rather than
// crash the oplog tailer with "Unknown command"; the db-qualified versions of
// these commands still flow through the normal `<db>.$cmd` path.
export function isIgnorableAdminCommand(doc) {
  return !!(
    doc &&
    doc.o &&
    ('drop' in doc.o || doc.o.dropDatabase || doc.o.create)
  );
}
