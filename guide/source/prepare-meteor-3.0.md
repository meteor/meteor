---
title: How to migrate to Meteor Async in Meteor 2.x
description: How to migrate your application to async methods and be ready to 3.0.
---

In the new Meteor 3.0, Meteor moves its methods/operations to asynchronous. In the past, version 2.x was using Fibers, our promise solution, which is no longer supported since Node 16, and to follow the community standards, we are moving to `async` and `await`.

Here are a couple of methods that are now async, and you need to refactor them. Instead of findOne, you need to use the suffix Async, findOneAsync, for example:

Mongo.Collection:
- findOneAsync
- insertAsync
- removeAsync
- updateAsync
- upsertAsync

Collection.Cursor:
- countAsync
- fetchAsync
- forEachAsync
- mapAsync

accounts-base:
- Meteor.userAsync()

callback-hook:forEachAsync
- forEachAsync

ddp-server
- Meteor.callAsync()

The complete list of updated methods is listed [here](https://github.com/meteor/meteor/blob/d5c3b2eeafd0ad78ee7e2553f3f269c5c2a2e2a9/docs/generators/changelog/versions/3.0.md#L5-L17).

If you want to understand better what was changed and the context of Fibers, read these complementary posts:
- [2.8](https://grubba.medium.com/new-meteor-2-8-and-the-new-mongodb-async-ap-edbcb853869a?source=user_profile---------9----------------------------) _New Meteor 2.8 and the new MongoDB Async API_
- [2.8.1](https://grubba.medium.com/new-meteor-2-8-1-and-adding-types-to-the-core-8a6ee56f0141?source=user_profile---------7----------------------------) _New MeteorJS 2.8.1 and adding types to the core_
- [2.9](https://blog.meteor.com/new-meteorjs-2-9-and-the-new-scaffold-api-5fcc0f3b1ce5) _New MeteorJS 2.9 and the new Scaffold API_
- [2.10](https://blog.meteor.com/new-meteor-js-2-10-and-the-async-tracker-feature-ffdbe817c801) _New Meteor.js 2.10 and the Async Tracker Feature_
- [2.11](https://grubba.medium.com/new-meteor-2-11-and-the-new-embedded-mongodb-19767076961b?source=user_profile---------4----------------------------) _New Meteor 2.11 and the new embedded MongoDB_
- [2.12](https://grubba.medium.com/new-meteor-js-2-12-and-the-blaze-2-6-2-release-b72c2a7a593f?source=user_profile---------1----------------------------) _New Meteor.js 2.12 and Blaze 2.6.2 Release_
- [2.13](https://grubba.medium.com/new-meteor-js-2-13-node-js-14-21-4-security-patch-and-blaze-2-7-1-release-60134947e4c?source=user_profile---------0----------------------------) _New Meteor.js 2.13, Node.js 14.21.4 security patch and Blaze 2.7.1 release_

To help Meteor users update their apps to the new Meteor version, you can follow this guide with some insights on how to do it.

## Use at least Meteor version [2.8](https://blog.meteor.com/new-meteor-2-8-and-the-new-mongodb-async-ap-edbcb853869a)

We recommend starting the async migration by updating your application to 2.8 or newer, as you can do this progressively. Unlike 3.0, you can simultaneously maintain the same codebase with the new asynchronous and old synchronous behaviors. Ideally, you should update to the latest version of Meteor 2.x and carefully follow each changelog. After you refactor all your code to async in version 2.x, you can more easily update it to version 3.0 by following all the changes listed in its [changelog](https://github.com/meteor/meteor/blob/d5c3b2eeafd0ad78ee7e2553f3f269c5c2a2e2a9/docs/generators/changelog/versions/3.0.md).

To help with this update, we suggest you use a [codemod](https://www.sitepoint.com/getting-started-with-codemods/) to automate part of the refactoring process. Follow [this script](https://github.com/minhna/meteor-async-migration) created by [minhna](https://github.com/minhna). The project has documentation explaining how to run the script. This codemod should only affect the server side of your application. Starting the update from the front end or back end is a personal choice. While starting from the server side is a valid approach, it is essential to evaluate whether migrating features one by one might be a better strategy. This way, you can resolve errors incrementally and avoid the risk of encountering multiple client-side issues that could break the entire application.

A helpful feature of the script is that it will refactor some methods to async, such as findOne, count, and other methods from the accounts-base package, such as `Meteor.user()`, and also the function that calls these methods by adding an 'async' before them.

## Edge cases
Depending on your codebase, the codemod may not work in some specific scenarios. We'll list some edge case examples, and if this is the case for your codebase, you'll need to make the changes manually or refactor the codemod.

### MongoDB methods updates
A possible edge case is if you are defining your MongoDB collection using the `meteor/quave:collections` package, the codemod will check if it is a MongoDB collection by checking the form of the imports - this means that when the script reads the import coming from ` quave`, it will not consider this to be a MongoDB collection.

### Async functions
Let's assume your codebase has the same or similar issue listed above. This may imply some problems in refactoring for async functions since the codemod does not correspond to any async method case. This can generate other side effects that imply issues with refactoring forEachAsync, mapAsync, and others.

### How do we identify those edge cases?
To identify these edge cases, you can use the search feature in your IDE to find your methods and start refactoring by running your refactored codemod or updating the code manually. Since it now only affects the server side, after refactoring, you can run your application, observe the errors that will occur in your terminal, and fix them progressively.
After refactoring the server side to async, your application will run without errors, and then you can move to the client side.

## Changes for Blaze projects (at least [2.7](https://www.blazejs.org/changelog#v2702023may23))
In Blaze, every HTML file has a related JavaScript file. After refactoring the JavaScript file to async, you will get a Promise wrapping the value instead of the actual value. To present it on your front end, you must unwrap it. Let's see an example:

```javascript
{{#let shouldFlag=isFlagged}}
  {{#if  @pending 'shouldFlag' }}
    <span class="stat-loading"><span class="icon-loading"></span></span>
  {{/if}}
  {{#if  @rejected 'shouldFlag' }}
    <span class="stat-err"><span class="icon-err"></span></span>
  {{/if}}
  {{#if @resolved 'shouldFlag' }}
    <span class="stat-flag"><span class="icon-flag"></span></span>
  {{/if}}
{{/let}}
```

If you don't unwrap the value, you will get an unresolved promise on the front end. You can use Blaze [Async States](https://www.blazejs.org/api/spacebars#Async-states), which uses the Spacebars Meteor package to handle the promise state. With it, you can handle different states and return appropriate content.

## Changes for React projects
We recommend installing the package `react-meteor-data`, which contains hooks for these new asynchronous methods. If you use `useFind` on the server side, with SSR, for example, you will need to use the new suspense/useFind hook. We recommend reading the [New Suspense Hooks for Meteor](https://blog.meteor.com/new-suspense-hooks-for-meteor-5391570b3007) article to understand this package better. Example:

```javascript
const TaskList = () => {
  useSubscribe("tasks");
  const tasks = useTracker('tasks',() => TasksCollection.find({}).fetch());
  return (
    <ul>
      {tasks.map((task) => (
        <Task key={task._id} task={task} />
      ))}
    </ul>
  );
};

export const App = () => {
  return (
    <div>
      <h1>Welcome to Meteor!</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <TaskList />
        <UserProfile />
      </Suspense>
    </div>
  );
};
```

Note that we're not using the if (loading) anymore. To see a practical project, you can check [simpletasks](https://github.com/fredmaiaarantes/simpletasks/), which already use asynchronous API.

If you use `Tracker.autorun()`, for example, reading about the tracker with the [async callback function](https://blog.meteor.com/new-meteor-js-2-10-and-the-async-tracker-feature-ffdbe817c801) is also recommended.


## Changes for packages

### Meteor.isFibersDisabled

You can use the [`Meteor.isFibersDisabled`](https://github.com/meteor/meteor/blob/6ac474627a4d2536090484eb95e7c021370aaefe/packages/meteor/asl-helpers-client.js#L1-L8) property to check if the current Meteor version
is using Fibers or not. In all releases before Meteor 3.0 this property will be `falsy`(`undefined`).
In Meteor 3.0 this property will be return `true`.

Which means that you can have a code like this:

```js

if (Meteor.isFibersDisabled) {
  // Meteor 3.0
} else {
  // Meteor 2.x
}

```

### Changes for packages that are client-only

If your package is client-only, you don't need to worry about the async changes. You can update your package to be compatible with Meteor 3.0 by adding the following line to your `package.js`:

```js
Package.onUse((api) => {
  api.versionsFrom(['1.10', '2.3', '3.0-alpha.19']);
  //                            ^^^^^^^ for testing your package with meteor 3.0

  api.versionsFrom(['1.10', '2.3', '3.0']);
  //                           ^^^^^^^ for meteor 3.0
});
```

If you want an example of this change, you can take a look at this [commit](https://github.com/meteor/react-packages/commit/96313a1afcc41ef9a23c7496470b375e7d357793)
where it was made possible for a package to be used in Meteor 3.0.

This change makes sure that your package is still compatible with Meteor 2.x
and also with Meteor 3.0.


### Changes for packages that do not use Meteor packages that had breaking change

Similar to what happens with client-only packages,
if your package is not using Meteor packages that had breaking changes,
you can update your package to be compatible with Meteor 3.0
by adding the following line to your `package.js`:

```js
Package.onUse((api) => {
  api.versionsFrom(['1.10', '2.3', '3.0-alpha.19']);
  //                            ^^^^^^^ for testing your package with meteor 3.0

  api.versionsFrom(['1.10', '2.3', '3.0']);
  //                           ^^^^^^^ for meteor 3.0
});
```

For example, we have `mdg:seo` where we just needed to add the line above to make it
compatible with Meteor 3.0.
You can see the [commit](https://github.com/meteor/galaxy-seo-package/commit/8a30b32688df40e62ce434475dd3ee931dedf2b3).


### Changes for packages that are using Meteor API that will become async

In these packages, it will be necessary to refactor and migrate some of its APIs.
You can be ready for Meteor 3.0 by migrating its API to be async. You can run your tests
using Meteor 3.0 and ensure everything works as expected.

A good example can be seen here in this [PR](https://github.com/percolatestudio/meteor-synced-cron/pull/149), where we added support for any Meteor version
beyond v2.8 and also for Meteor 3.0.


-----------

We hope to make your transition easier with these instructions, references, and tools. You may face some challenges, but remember that you can progressively refactor it. For more detailed updates on Meteor 3.0, please check our [Fibers project board](https://github.com/orgs/meteor/projects/10) and the [Meteor 3.0 PR](https://github.com/meteor/meteor/pull/12359).
