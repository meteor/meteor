# Migrating to Meteor v3

This guide is a livid document where we will be documenting the process of migrating to Meteor v3.
This guide will be updated as we progress through the development of Meteor v3.



## What's the status of version 3.0?

**Latest version:** `3.0-beta.6` <br/>
**Node.js version:** `20.9.0 LTS`

Meteor 3.0 is in alpha and not recommended for production. You can check the "[Release 3.0 Pull Request](https://github.com/meteor/meteor/pull/12359)" to see what is being changed.

## How to prepare for version 3.0?

You can follow the guide "[How to migrate to Meteor Async in Meteor 2.x](https://guide.meteor.com/prepare-meteor-3.0)" to help you prepare your application for the new version by starting to use async methods.

## What this guide will cover

This guide will try to cover the topics needed to migrate your application to Meteor v3. We will cover the following topics:

- TODO: Add topics

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

## What is left until Meteor v3 is released?

We have our GitHub discussion where we give updates regarding the development of Meteor v3. You can check it out [here](https://github.com/meteor/meteor/discussions/12865).

The status is the following:


### Beta

#### Documentation

- [ ] ⛏️👷 Update Meteor API Docs to v3 and migrate to Vitepress [[Grubba27](https://github.com/Grubba27)]
- [ ] Guides
  - [ ] ⛏️👷 How to migrate to Meteor Async in Meteor 2.x
    - We are working on our own [version](https://guide.meteor.com/prepare-meteor-3.0), but led by Daniel Dornhardt, the community is also working on one. You can check the current document [here](https://docs.google.com/document/d/1XxHE5MQaS0-85HQ-bkiXxmGlYi41ggkX3F-9Rjb9HhE/edit#heading=h.65xi3waq9bb) and also the [post](https://forums.meteor.com/t/additional-async-transition-documentation/60739) in the forum.
  - [ ] How to migrate from Meteor 2.x to Meteor 3.0
- [ ] Update Tutorials for Meteor 3.0 with React and Blaze


#### Bugs / Issues

- [x] Error with Source-map showing up in some cases. [Context](https://meteor-community.slack.com/archives/C01SWPPE81F/p1702314166182529).
- [x] Insert not working for collection created of the fly. [Context](https://meteor-community.slack.com/archives/CN350MY1G/p1704695310758029) [[nachocodoner](https://github.com/nachocodoner)].
- [x] Fix Async interators for Meteor 3 [context](https://forums.meteor.com/t/symbol-asynciterator-for-the-cursor-in-version-3-0-alpha-11/60549)
- [ ] ⛏️👷 https://github.com/meteor/meteor/issues/12950 [[nachocodoner](https://github.com/nachocodoner)]
- [X] ⛏️👷 Review `observeChanges`  -  [#12918 [Meteor 3] Mongo.Cursor.observeChanges returns a Promise instead of a query handle](https://github.com/meteor/meteor/issues/12918) [[nachocodoner](https://github.com/nachocodoner)]
- [x] [accounts-password: Meteor.user() doesn't return the user inside a Meteor.createUser() anymore](https://github.com/orgs/meteor/projects/10?pane=issue&itemId=27872647). [[denihs](https://github.com/denihs)] [[PR](https://github.com/meteor/meteor/pull/13027)]
  - Some tests heavily depend on the behavior, like [this one].(https://github.com/meteor/meteor/blob/ce22f2d548d237b6a1d70064a86b106a853021cc/packages/accounts-password/password_tests.js#L132-L134). [This](https://github.com/meteor/meteor/blob/ce22f2d548d237b6a1d70064a86b106a853021cc/packages/accounts-base/accounts_client.js#L370-L372) was the workaround used to make the tests pass. It's not the ideal solution. We need to make sure to understand why this was happening and fix it.
- [x] [Fix minifying lazy stylesheets](https://github.com/orgs/meteor/projects/10?pane=issue&itemId=27872533).
  - It is required for Tailwind to work. The minifier is given the content as a promise instead of as a string, which causes the `custom minifier - devel vs prod` test to fail.
- [x] [Fix Linker bug](https://github.com/orgs/meteor/projects/10?pane=issue&itemId=27872545) [[denihs](https://github.com/denihs)] [[PR](https://github.com/meteor/meteor/pull/13031)]
  - In this [commit](https://github.com/meteor/meteor/pull/12580/commits/eb63a1b6643805590d3bf70ff9611e837aede1e9#diff-0972e87d5bf49b0ff289a29dee4ae83bb04b83d2e057976f7a7680e0e1ee2e0aR176-R177), we introduced a hack to avoid returning the same file more than once in the function getPrelinkedFiles().
- [x] [Fix springboarding and warehouse](https://github.com/orgs/meteor/projects/10?pane=issue&itemId=27872557) [[denihs](https://github.com/denihs)] [[PR](https://github.com/meteor/meteor/pull/13032)]
  - We probably need to fix springboarding before releasing a beta. These are tested at `tools/tests/update-tests.js`.
- [ ] Remove any and all references to fibers throughout the code base.

#### To Implement

- [ ] [Bring / Update community packages](https://github.com/orgs/meteor/projects/10?pane=issue&itemId=27872581)
  - There are 3 community packages that we want to bring to the core: meteor-migrations, meteor-synced-cron, and meteor-collection-hooks.
- [ ] Check how difficult would be to enable native ES modules on Meteor. [Context](https://github.com/meteor/meteor/discussions/12865#discussioncomment-8032938)
- [ ] Update Meteor 3.0 to use Reify 0.25.1
    - Some places are still using version 0.24.0
- [ ] Remove @3.0.0-beta300.1 from skeletons that use `react-meteor-data` once we have an official react-meteor-data@3.0.0 version
    - We had to pin this version because, as react-meteor-data is not a core package, it'll always get the latest version (v2 right now) when creating a new app

#### Performance / Helpers

- [ ] Create a stress test to compare data between Meteor 2 and Meteor 3, now without Fibers and Node 20.
  - We want to create materials comparing Meteor 2 and 3 performance.
- [ ] Evaluate how we can create tools to help in the migration process.
  - The community has created a [Codemod](https://forums.meteor.com/t/how-did-i-migrate-our-app-to-new-async-api-meteor-2-8/59295), Meteor [packages](https://dev.to/jankapunkt/prepare-your-meteorjs-project-for-the-big-30-release-14bf) and [ESLint plugins](https://forums.meteor.com/t/meteor-3-0-async-functions-eslint-plugin/60738/19).


#### CI / Tests

- [ ] [Circle CI tests failing for external packages [Group 3]](https://github.com/orgs/meteor/projects/10?pane=issue&itemId=27872498).
  - Some tests are still failing in this Group.
- [ ] [Circle CI tests failing for external packages [Group 5]](https://github.com/orgs/meteor/projects/10?pane=issue&itemId=27872508).
  - Some tests are still failing in this Group.


### Independent releases

- [ ] Review compiler-plugin addStylesheet.
  - We have a partial fix for stylesheets that we need to make if we want to keep. For more [context](https://github.com/meteor/meteor/pull/12538).
- [ ] [CoffeeScript](https://github.com/orgs/meteor/projects/10?pane=issue&itemId=27872760)
  - Test everything related to CoffeeScript and make sure it works.
- [ ] [Email package](https://github.com/orgs/meteor/projects/10?pane=issue&itemId=27872785)
  - Analyze if it's possible and/or if it has good performance even using TLA.
- [ ] [Improve HMR performance](https://github.com/orgs/meteor/projects/10?pane=issue&itemId=33121116)
  - Make sure the changes we did with HMR don't hurt the performance. For more [context](https://github.com/meteor/meteor/pull/12542).



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

## Will MongoDB Collection Methods be removed from the server?

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
meteor create my-new-project --release 3.0-beta.6
```

## How to update from version 2?

You can update your Meteor 2.x project by running the command below inside your project folder:

```bash
meteor update --release 3.0-beta.6
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
