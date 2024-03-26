# Breaking changes

## MongoDB Methods in the server

As mentioned in the [overview](../index.md#mongo-methods-server) `insert`, `update`,
 `remove`, `find`, `findOne`, `upsert` methods no longer work in the server.

You should migrate to use their `Async` counterparts.


```js

const docs = MyCollection.find({ _id: '123' }).fetch(); // [!code error] This will not work in the server


const docs = await MyCollection.find({ _id: '123' }).fetchAsync(); // [!code highlight] This will work in the server


const doc = MyCollection.findOne({ _id: '123' }); // [!code error] This will not work in the server

const doc = await MyCollection.findOneAsync({ _id: '123' }); // [!code highlight] This will work in the server

```

## CLI

The `--vue2` flag is no longer available. We droped support for vue2.
You can see more information in this [PR](https://github.com/meteor/meteor/pull/13065)


## Node v20

Meteor 3.0 is now using Node v20. This means that if you have any dependencies or usages
of Node v14, you will need to update them to be compatible with Node v20.


## NPM Installer

The npm installer has changed a bit. Now you can install Meteor using the following command:

```bash
npx meteor
```

or

```bash
npx meteor@<version>
```

You should be using a node version >= 20.0.0
