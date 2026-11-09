// Given the result of the Mongo `ismaster` command run against the oplog
// connection, return an error message explaining why the oplog cannot be
// tailed, or null if it can.
export function replicaSetOplogError(isMasterDoc) {
  if (isMasterDoc && isMasterDoc.setName) {
    return null;
  }

  if (isMasterDoc && isMasterDoc.isreplicaset === true) {
    // The server belongs to a replica set that has not been initialized yet, so
    // it has no name. Point at the actual cause instead of the generic message.
    return "$MONGO_OPLOG_URL points at a Mongo replica set that has not been " +
      "initialized. Run rs.initiate() on the server, then restart." +
      (isMasterDoc.info ? " (server reported: " + isMasterDoc.info + ")" : "");
  }

  return "$MONGO_OPLOG_URL must be set to the 'local' database of a Mongo replica set";
}
