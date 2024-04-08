# Migrating to Meteor v3

This guide is a livid document where we will be documenting the process of migrating to Meteor v3.
This guide will be updated as we progress through the development of Meteor v3.



## What's the status of version 3.0?

**Latest version:** `3.0-beta.7` <br/>
**Node.js version:** `20.9.0 LTS`


## How to prepare for version 3.0?

You can follow the guide "[How to migrate to Meteor Async in Meteor 2.x](https://guide.meteor.com/prepare-meteor-3.0)" to help you prepare your application for the new version by starting to use async methods.

## What this guide will cover

This guide will try to cover the topics needed to migrate your application to Meteor v3. We will cover the following topics:

- [Breaking Changes](./breaking-changes/index.md), an overview of the changes that will affect your application.
  - [Meteor.call x Meteor.callAsync](./breaking-changes/call-x-callAsync.md), why should you change your methods to use `Async` methods.
  - [Upgrading packages](./breaking-changes/upgrading-packages.md), how to upgrade your packages to the be compatible with Meteor v3.

- [How async functions work and how to use them](./api/async-functions.md), a how-to guide in how to use async functions and helpers for Meteor.
- [Renamed Functions](./api/renamed-functions.md), a list of functions that were renamed in Meteor v3.
- [Removed Functions](./api/removed-functions.md), a list of functions that were removed in Meteor v3.

- [React in Meteor v3](./front-end/react.md), how to migrate your react code to Meteor v3
- [Blaze in Meteor v3](./front-end/blaze.md), how to migrate your blaze code to Meteor v3

- [How to migrate to Meteor 3.x in 2.x](./how-to-migrate/index.md), how can you migrate your application to Meteor v3 while in 2.x.

## What is Fibers?

Meteor was designed at a time when callback hell was a development issue, so the team decided it at the time
to use [fibers](https://en.wikipedia.org/wiki/Fiber_(computer_science)) to make building applications much more straightforward with synchronous-looking code.
The Meteor fibers implementation is based on [node-fibers](https://github.com/laverdet/node-fibers), which is no longer supported as of NodeJS v16.0.0.

The main reason for this migration is to remove the dependency on fibers and make Meteor
compatible with the latest versions of Node.js.

For more information about fibers, you can check this [talk](https://www.youtube.com/watch?v=bxaOGDqVPKw)
from Ben Newman and this Stack Overflow [answer](https://stackoverflow.com/a/40865153/6688795).



## What is the Meteor v3 release schedule?

Our current plan is to release Meteor v3 until Q2 2024. This is subject to change as we progress through the development of Meteor v3.

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

## How to test Meteor 3.0?

You can create a new Meteor 3.0 project by running the command below:

```bash
meteor create my-new-project --release 3.0-beta.7
```

## How to update from version 2?

You can update your Meteor 2.x project by running the command below inside your project folder:

```bash
meteor update --release 3.0-beta.7
```


## When will React packages for Meteor be ready for version 3.0?

We consider React packages to be ready.
You can check more information on the [react page](./front-end/react.md).

## When will Blaze be ready for version 3.0?

The team considered Blaze adjustments to version 3.0 done, version 2.9 and upper are with all features regarding async APIs.

You can check more information on the [Blaze page](./front-end/blaze.md).

## When will XYZ package be ready for version 3.0?

Meteor core packages are the responsibility of Meteor Software and are all being migrated.
If you encounter issues with any of them, let us know, please [open an issue](https://github.com/meteor/meteor/issues/new/choose) in our [repo](https://github.com/meteor/meteor).

This is the [list of all core packages](https://docs.meteor.com/packages/packages-listing.html).

We will bring these three new packages to the core and migrate them to Meteor 3.0:
  - `percolate:migrations` - [GitHub](https://github.com/percolatestudio/meteor-migrations);
  - `littledata:synced-cron` - [GitHub](https://github.com/percolatestudio/meteor-synced-cron);
  - `matb33:collection-hooks` - [GitHub](https://github.com/Meteor-Community-Packages/meteor-collection-hooks);


For those packages that are not in the core but are maintained by the [community](https://github.com/Meteor-Community-Packages),
we hope that the community can work on them, but if for some reason that is not possible,
you can always ping us on [Slack](https://join.slack.com/t/meteor-community/shared_invite/zt-28aru814j-AwswQGt2D1xIXurvmtJvug) or in the [Forums](https://forums.meteor.com/).


## External links

Currently we are aware of the following community migration guides:
 - [Meteor 3.0 Migration Guide, from Daniel](https://docs.google.com/document/d/1XxHE5MQaS0-85HQ-bkiXxmGlYi41ggkX3F-9Rjb9HhE/edit#heading=h.65xi3waq9bb)
 - [Illustreets Migration Guide, large SaaS migrated to 3.0](https://forums.meteor.com/t/large-saas-migrated-to-3-0/61113) & their how-to [post](https://forums.meteor.com/t/meteor-3-0-beta-6-is-out/61277/12)
 
### Videos

Migrating apps to Meteor 3.0:
- TicTacToe & others - [YouTube](https://www.youtube.com/watch?v=MtStd0aeyQA)
- Complex Svelte todo list & others - [YouTube](https://www.youtube.com/watch?v=-XW8xwSk-zU)
- Meteor university in 3.0:
  - part 1 - [YouTube](https://www.youtube.com/watch?v=WbwHv-aoGlU)
  - part 2 - [YouTube](https://www.youtube.com/watch?v=PB2M16fmloM)
  - part 3 - [YouTube](https://www.youtube.com/watch?v=79ytCgZQfSU)
  - part 4 - [YouTube](https://www.youtube.com/watch?v=InNCy0duKak)

---

If you have a migration guide, it can be video or text, please let us know so we can add it here.

