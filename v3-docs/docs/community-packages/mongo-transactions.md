# Mongo-transactions

- `Who maintains the package` – [Jam](https://github.com/jamauro)

[[toc]]

## What is this package?

`jam:mongo-transactions` enables an easy way to work with Mongo Transactions in Meteor apps. Here are a few of the benefits:

* Write with the standard Meteor collection methods you're accustomed to. You don't need to worry about using `rawCollection()`, though if you need a particular `rawCollection()` method, you can still use it.
* You don't need to worry about passing `session` around. This package takes care of that for you.
* Because it's a low-level solution, ID generation works as expected.
* Works out-of-the-box with other packages that automatically validate on DB writes, like `jam:easy-schema` and `aldeed:collection2`.
* One simple API to use. Mongo has made things complicated with two APIs for Transactions, the Callback API and the Core API. This package defaults to using the Callback API as recommended by Mongo, but allows you to use the Core API by passing in `autoRetry: false`.
* Can be used isomorphically.
* Compatible with Meteor 2.8.1 and up, including support for Meteor 3.0+

> **Important**: This package expects that you'll use the promise-based `*Async` Meteor collection methods introduced in `v2.8.1` though it will technically work with the older syntax without the `*Async` suffix as long as you don't use callbacks. It does **not** cover using callbacks with Meteor collection methods.

## How to download it?
Add the package to your app
```bash
meteor add jam:mongo-transactions
```
### Sources

* [GitHub repository](https://github.com/jamauro/mongo-transactions)

## How to use it?

### Create a Transaction

> **Note**: there's no need to pass `session` into the `*Async` collection methods. This package handles that for you.

```js
import { Mongo } from 'meteor/mongo';

async function purchase(purchaseData) {
  try {
    const { invoiceId } = await Mongo.withTransaction(async () => {
      const invoiceId = await Invoices.insertAsync(purchaseData);
      const changeQuantity = await Items.updateAsync(purchaseData.itemId, { $set: {...} });
      return { invoiceId, changeQuantity } // you can return whatever you'd like
    });
    return invoiceId;
  } catch (error) {
    // something went wrong with the transaction and it could not be automatically retried
    // handle the error as you see fit
  }
}
```

### Passing Transaction options
If you want to customize how the Transaction runs, pass in the Transaction options as the second argument, for example:
```js
await Mongo.withTransaction(async () => {
  ...
}, { writeConcern: { w: 1 } });
```
Refer to the [Mongo Node API docs](https://mongodb.github.io/node-mongodb-native/6.3/interfaces/TransactionOptions.html) for more information about Transaction options.

### Preventing automatic retries if the Transaction fails
Most of the time, you'll want the default behavior where the Transaction is automatically retried for a `TransientTransactionError` or `UnknownTransactionCommitResult` commit error. But if you don't want that behavior, simply pass in `{ autoRetry: false }` like this:

```js
await Mongo.withTransaction(async () => {
  ...
}, { autoRetry: false });
```

Setting `{ autoRetry: false }`, means the Transactions Core API will be used rather than the Callback API and you'll be responsible for handling all errors. You can read more about the differences in the [Mongo Docs](https://www.mongodb.com/docs/manual/core/transactions-in-applications/).

### Determine if you're in a Transaction
To determine if the code is currently running in a Transaction, use:
```js
Mongo.inTransaction(); // returns true or false
```

### Using Isomorphically for Optimistic UI
You can write `Mongo.withTransaction` and `Mongo.inTransaction` isomorphically for Optimistic UI however note that the Transaction will only truly be performed on the server.

As with any isomorphic code, you should be aware that it may fail because the operation can't succeed on the client but will succeed on the server. For example, let's say you're using `.find` within the Transaction and Minimongo on the client doesn't have that particular data, the client will fail but the server should still succeed. You can wrap specific server-only code with `if (Meteor.isServer)`, but in these cases, you'll likely want to avoid isomorphic code and make sure the entire Transaction code only runs on the server.

## Using Mongo Atlas as your DB?
> **Important**: In my experience, you must use a paid tier for Transactions to work as expected with Meteor. The free tier would not tail the oplog for Transactions. So if you're trying this out in production, be sure to use a paid tier.
