# npm-mongo-next
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/npm-mongo-next) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/npm-mongo-next)
***

Opt in to version 7 of the MongoDB Node.js driver before it becomes Meteor's
default:

```sh
meteor add npm-mongo-next
```

Remove the package to go back to the driver bundled with `npm-mongo`. It cannot
be combined with `npm-mongo-legacy`.

Meteor's own collections, publications, oplog tailing and change streams work
the same with either driver. Code that uses the driver directly, through
`rawCollection()`, `rawDatabase()` or `MongoInternals.NpmModules.mongodb`, may
need changes. The main ones in driver 7:

- `MONGODB-AWS` authentication requires `@aws-sdk/credential-providers` and no
  longer accepts credentials in the connection string or options.
- `mongodb-client-encryption`, `kerberos` and `@mongodb-js/zstd` must be at
  version 7.
- `cursor.stream({ transform })` is removed; use `cursor.stream().map(fn)`.
- Dropping a collection that does not exist returns `false` instead of throwing.
- Cursors no longer request 1000 documents per `getMore` by default.
- Several deprecated options and TypeScript types are removed.

See the [driver 7.0.0 release notes](https://github.com/mongodb/node-mongodb-native/releases/tag/v7.0.0)
for the full list.
