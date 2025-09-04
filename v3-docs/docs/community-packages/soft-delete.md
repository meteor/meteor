# Soft-delete

- `Who maintains the package` – [Jam](https://github.com/jamauro)

[[toc]]

## What is this package?

Soft Delete is an easy way to add soft deletes to your Meteor app. Its key features are:

* Zero config needed (though you can customize)
* Isomorphic so that it works with Optimistic UI
* Automatically overrides `removeAsync` to make it a soft delete
* Automatically adds the soft delete flag on `insertAsync` and to the filter for your queries, e.g. `.find`, so you don't need to make any changes to them
* Recover soft deleted docs with `recoverAsync` collection method
* Explicitly soft delete with `softRemoveAsync` collection method (optional)
* Optionally add a `deletedAt` timestamp
* Optionally exclude specific collections
* Compatible with Meteor `2.8.1+` and `3.0+`

> **Note:** Alternative to soft deletion is to archive documents in your collection. You can use [`jam:archive`](./archive.md) package for that. Be sure to compare those two approaches to pick the solution best suited for your application.

## How to download it?

Add the package to your app
```bash
meteor add jam:soft-delete
```
### Sources

* [GitHub repository](https://github.com/jamauro/soft-delete)

## How to use it?

### Deleting permanently
By default, this package overrides the `removeAsync` collection method so that it soft deletes the document(s) with a boolean flag rather that removing them from the database. To delete permanently, pass in the option `soft: false`, e.g.:
```js
Collection.removeAsync(/* your filter */, { soft: false })
```

If you prefer, you can prevent overriding the `removeAsync` by setting `overrideRemove: false`. See [Configuring](#configuring-optional) for more details.

### Explicitly soft deleting
If you prefer, you can explicity use `softRemoveAsync`, e.g.:
```js
Collection.softRemoveAsync(/* your filter */)
```

### Recovering a document
To recover a soft deleted document, use `recoverAsync`, e.g.:
```js
Collection.recoverAsync(/* your filter */)
```

## Configuring (optional)
If you like the defaults, then you won't need to configure anything. But there is some flexibility in how you use this package.

Here are the global defaults:
```js
const config = {
  deleted: 'deleted', // the field name used for the boolean flag. you can update to your preference, e.g. 'isDeleted'
  deletedAt: '', // add the name of the field you'd like to use for a deletedAt timestamp, e.g. 'deletedAt', if you want to include it on your docs
  autoFilter: true, // automatically adds the { [deleted]: false } filter to your queries
  overrideRemove: true, // overrides the Collection.removeAsync method to make it a soft delete instead
  exclude: ['roles', 'role-assignment'] // exclude specific collections from using soft delete. defaults to excluding the collections created the meteor roles package
};
```

To change the global defaults, use:
```js
// put this in a file that's imported on both the client and server
import { SoftDelete } from 'meteor/jam:soft-delete';

SoftDelete.configure({
  // ... change the defaults here ... //
});
```
