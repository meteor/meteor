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

