import { replicaSetOplogError } from '../oplog_replica_set_error';

Tinytest.add('mongo-livedata - oplog - replicaSetOplogError', function (test) {
  // An initialized replica set has a setName: tailing is allowed.
  test.equal(replicaSetOplogError({ setName: 'rs0', ismaster: true }), null);

  // A replica set member whose set has not been initialized yet reports
  // isreplicaset:true with no setName. Point at that specific cause.
  const uninitialized = replicaSetOplogError({
    isreplicaset: true,
    info: 'Does not have a valid replica set config',
  });
  test.matches(uninitialized, /has not been initialized/);
  test.matches(uninitialized, /rs\.initiate\(\)/);
  test.matches(uninitialized, /Does not have a valid replica set config/);

  // A standalone server (not a replica set) keeps the original message.
  test.matches(
    replicaSetOplogError({ ismaster: true }),
    /must be set to the 'local' database of a Mongo replica set/
  );
});
