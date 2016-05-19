# mongo

The `mongo` package is a [full stack database
driver](https://www.meteor.com/full-stack-db-drivers) that provides
several paramount pieces of functionality to work with MongoDB in
Meteor:

- an efficient [Livequery][livequery] implementation providing real-time
  updates from the database by consuming the MongoDB replication log
- a fall-back Livequery implementation for cases when the replication log is not
  available, implemented by polling the database
- DDP RPC end-points for updating the data from clients connected over the wire
- Serialization and deserialization of updates to the DDP format

To learn more about Livequery, see the [project page on
www.meteor.com][livequery].

[livequery]: https://www.meteor.com/livequery

## Direct access to npm mongodb API

On the server, the `mongo` package is implemented using the
[npm `mongodb` module](https://www.npmjs.com/package/mongodb).  If you'd like
direct access to this module, you can find it at
`MongoInternals.NpmModules.mongodb.module`. Its version can be read at
`MongoInternals.NpmModules.mongodb.version`.

Additionally, you can call `c.rawCollection()` or `c.rawDatabase()` on any
`Mongo.Collection` to get the object from the npm `mongodb` module corresponding
to the collection or database.  This is documented at
http://mongodb.github.io/node-mongodb-native/

The version of `mongo` used may change incompatibly from version to version of
Meteor (or we may even replace it with an entirely different implementation);
use at your own risk.
