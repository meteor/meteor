# Frequently Asked Questions

## What is Fibers?

Meteor was designed at a time when callback hell was a development issue, so the team decided it at the time
to use [fibers](https://en.wikipedia.org/wiki/Fiber_(computer_science)) (coroutines) to make building applications much more straightforward with synchronous-looking code.
The Meteor fibers implementation is based on [node-fibers](https://github.com/laverdet/node-fibers), which is no longer supported as of NodeJS v16.0.0.

The main reason for this migration is to remove the dependency on fibers and make Meteor
compatible with the latest versions of Node.js.

For more information about fibers, you can check this [talk](https://www.youtube.com/watch?v=bxaOGDqVPKw)
from Ben Newman and this Stack Overflow [answer](https://stackoverflow.com/a/40865153/6688795).

## What is the Meteor v3 release schedule?

Meteor 3 official version is already out! You can check our posts about it on the [Forums](https://forums.meteor.com/t/its-official-meteor-3-0-official-release-is-out/61860) and [blog](https://dev.to/meteor/meteor-3-is-officially-here-3gml).

## Will MongoDB Collection Methods be removed from the client?

No, we will not remove any MongoDB collection method from the client.

On the client side, all can remain the same. You can use both sync and async methods.
All should continue working as they are.

For example:

```js

// 2.x in the client side

const docs = MyCollection.find({ _id: '123' }).fetch();

// v3.0 in the client side

const docs = MyCollection.find({ _id: '123' }).fetch();

```
No changes are necessary. If you want to use the async methods to maintain isomorphic code, you can do it like this:

```js

// 2.x in the client side

const docs = MyCollection.find({ _id: '123' }).fetch();

// v3.0 in the client side, this will work anywhere

const docs = await MyCollection.find({ _id: '123' }).fetchAsync();

```

## Will MongoDB Collection Methods be removed from the server? {#mongo-methods-server}

_Yes_, we will remove those MongoDB collection methods that do not end with `*Async`.

You can only use the methods with the `*Async` suffix on the server side.

For example:

```js
// 2.x in the server side

Meteor.methods({
  myMethod() {
    const doc = MyCollection.findOne({ _id: '123' });
  }
});


// v3.0 in the server side

Meteor.methods({
  async myMethod() {
    const doc = await MyCollection.findOneAsync({ _id: '123' });
  }
});
```

Methods that will be _only_ available in the *client* are:
-`findOne`;
-`insert`;
-`remove`;
-`update`;
-`upsert`;

If you leave any code using one of these methods in the server side, you will get an error,
like this one below:

```bash
findOne is not available on the server. Please use findOneAsync instead.
```

## When will React packages for Meteor be ready for version 3.0?

We consider React packages to be ready.
You can check more information on the [react page](../front-end/react.md).

## When will Blaze be ready for version 3.0?

Blaze 3 is out and compatible with Meteor 3. You can check the post about it [here](https://forums.meteor.com/t/blaze-3-is-out/61861).

## When will XYZ package be ready for version 3.0?

Meteor core packages are the responsibility of Meteor Software and are all being migrated.
If you encounter issues with any of them, let us know, please [open an issue](https://github.com/meteor/meteor/issues/new/choose) in our [repo](https://github.com/meteor/meteor).

This is the [list of all core packages](https://docs.meteor.com/packages/packages-listing.html).

For those packages that are not in the core but are maintained by the [community](https://github.com/Meteor-Community-Packages),
we hope that the community can work on them, but if for some reason that is not possible,
you can always ping us on [Slack](https://join.slack.com/t/meteor-community/shared_invite/zt-28aru814j-AwswQGt2D1xIXurvmtJvug) or in the [Forums](https://forums.meteor.com/).

