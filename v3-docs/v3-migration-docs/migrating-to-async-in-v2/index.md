# Migrating to Async in Meteor 2.x

In Meteor 3.0, we're transitioning from using Fibers to asynchronous methods and operations, aligning with community standards. While Fibers, our promise solution, was used in version 2.x, it's not supported from Node 16 onwards. We are now adopting `async` and `await` for better compatibility.

## Prerequisites

### Use at least Meteor version 2.8

We recommend starting the async migration by updating your application to 2.8 or newer,
as you can do this progressively. Unlike 3.0,
you can simultaneously maintain the same codebase with the new asynchronous and
old synchronous behaviors. Ideally, you should update to the latest version of Meteor 2.x
and carefully follow each changelog. After you refactor all your code to async in version 2.x,
you can more easily update it to version 3.0.

to check what version you are using, you can run:

```bash
meteor --version
```

You should see something like this:

```bash
meteor --version
Meteor <version>
```

## API changes

If in server-side you should focus on migrating and changing your APIs to use `async` and `await` pattern.

Here is a list of the most common APIs that you should change:

Mongo.Collection:
- `findOneAsync`
- `insertAsync`
- `removeAsync`
- `updateAsync`
- `upsertAsync`

Collection.Cursor:
- `countAsync`
- `fetchAsync`
- `forEachAsync`
- `mapAsync`

accounts-base:
- `Meteor.userAsync()`

callback-hook:forEachAsync
- `forEachAsync`

ddp-server
- `Meteor.callAsync()`


## Jscodeshift/codemod

One of our community members [minhna](https://github.com/minhna) has created this awesome
[repo](https://github.com/minhna/meteor-async-migration) for you to migrate your codebase to async.
it uses [jscodeshift/codemod](https://www.sitepoint.com/getting-started-with-codemods/) to help you migrate your codebase to async.

The project has documentation explaining how to run the script.
This codemod should only affect the server side of your application.
Starting the update from the front end or back end is a personal choice.
While starting from the server side is a valid approach, it is essential to evaluate whether migrating features one by one might be a better strategy.
This way, you can resolve errors incrementally and avoid the risk of encountering multiple client-side issues that could break the entire application.


A helpful feature of the script is that it will refactor some methods to async,
such as `findOne`, `count`, and other methods from the `accounts-base` package, such as `Meteor.user()`,
and also the function that calls these methods by adding an `async` before them.

### Edge cases

Depending on your codebase, the codemod may not work in some specific scenarios. We’ll list some edge case examples, and if this is the case for your codebase,
you’ll need to make the changes manually or refactor the codemod.

### MongoDB Methods from outside packages

A possible edge case is if you are defining your MongoDB collection using the `meteor/quave:collections` package,
the codemod will check if it is a MongoDB collection by checking the form of the imports - this
means that when the script reads the import coming from `quave`, it will not consider this to be a MongoDB collection.

Having this issue might require you to manually refactor the code or adjust the codemod to consider this specific case.

### How to identify edge cases

Since it now only affects the server side, after refactoring, you can run your application,
observe the errors that will occur in your terminal,
and fix them progressively. After refactoring the server side to async,
your application will run without errors, and then you can move to the client side.

It is recommended to run your tests after each refactoring to ensure that everything is working as expected.

Also if possible migrate one module of your application at a time, this way you can test and ensure that everything is working as expected.


## Front-end

For migrating the front-end, you can follow the guide based in your framework:

- [React](../front-end/react.md)
- [Blaze](../front-end/blaze.md)


## Packages

If you have packages that you are using in your application, you should check if they are compatible with Meteor 3.0.

If you own packages, you can check our migration guide for packages [here](../breaking-changes/upgrading-packages.md).
