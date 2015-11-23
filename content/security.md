---
title: "Security"
---

After reading this guide, you'll know:

1. The security surface area of a Meteor app
2. How to secure methods, publications, and source code
3. Where to store secret keys in development and production
4. How to follow a security checklist when auditing your app

## Security

Securing a web application is all about understanding security domains and understanding the attack surface between these domains. In a Meteor app, things are pretty simple:

1. Code that runs on the server can be trusted
2. Everything else: code that runs on the client, data sent through method and publication arguments, etc, can't be trusted

In practice, this means that you should do most of your security and validation on the boundary between these two domains. In simple terms:

1. Validate and check all data that comes from the client
2. Don't leak any secret data to the client

### The surface area of a Meteor app

Since Meteor apps are often written in a style that puts client and server code together, it's extra important to be aware what is running on the client, what is running on the server, and what the boundaries are. Here's a complete list of places security checks need to be done in a Meteor app:

1. **Methods**: Any data that comes in through method arguments needs to be validated, and methods should not return data the user shouldn't have access to.
2. **Publications**: Any data that comes in through publication arguments needs to be validated, and publications should not return data the user shouldn't have access to.
3. **Served files**: You should make sure none of the source code or configuration files served to the client have secret data.

Each of these points will have their own section below.

#### Don't use Collection.allow/deny

In this guide, we're going to take a strong position that using [allow](http://docs.meteor.com/#/full/allow) or [deny](http://docs.meteor.com/#/full/deny) to run MongoDB queries directly from the client is not a good idea. The main reason is that it is very hard to follow the principles outlined above. It's extremely hard to validate the complete space of possible MongoDB operators, which could potentially grow over time.

There have been several articles about the potential pitfalls of accepting MongoDB update operators from the client, in particular the [Allow & Deny Security Challenge](https://www.discovermeteor.com/blog/allow-deny-security-challenge/) and its [results](https://www.discovermeteor.com/blog/allow-deny-challenge-results/), both on the Discover Meteor blog.

Given the points above, we're going to recommend that all Meteor apps should use Methods to accept data input from the client, and restrict the arguments accepted by each Method as tightly as possible.


### Methods

Methods are the way your Meteor server accepts inputs and data from the outside world, so it's natural that they are the most important topic for security. If you don't properly secure your methods, you could result in users modifying your database in unexpected ways - editing other people's documents, deleting data, or messing up your database schema causing your app to crash.

#### The mdg:method package

To help you write good methods, we've written a simple wrapper package for Methods that enforces argument validation using `aldeed:simple-schema`. XXX elaborate here

#### Always specify a schema for your method arguments

This is trivial when using the `mdg:method` package, and you can also achieve the same effect by using [`check`](http://docs.meteor.com/#/full/check) inside a vanilla method. The idea is that you don't want someone to pass a data type you aren't expecting, which could mess up some of your logic.

Consider that if you are writing unit tests for your methods, you would need to test all possible kinds of input to the method; validating the arguments restricts the space of inputs you need to unit test, reducing the amount of code you need to write over all. It also has the extra bonus of being self-documenting; someone else can come along and read the code to find out what kinds of parameters a method is looking for.

#### Never pass the current user's ID as an argument

The `this` context inside every Meteor method has some useful properties, and the most useful is [`this.userId`](http://docs.meteor.com/#/full/method_userId). This property is managed by the DDP login system, and is guaranteed by the framework itself to be secure following widely-used best practices.

Given that the user ID of the current user is available through this context, you should never pass the ID of the current user as an argument to a method. This would allow any client of your app to pass any user ID they want. Let's look at an example:

```js
// #1: Bad! The client could pass any user ID and set someone else's name
setName({ userId, newName }) {
  Meteor.users.update(userId, {
    $set: { name: newName }
  });
}

// #2: Good, the client can only set the name on the currently logged in user
setName({ newName }) {
  Meteor.users.update(this.userId, {
    $set: { name: newName }
  });
}
```

The _only_ times you should be passing any user ID as an argument are the following:

1. This is a method only accessible by admin users, who are allowed to edit other users. See the section about user roles below.
2. This method doesn't modify the other user, but uses it as a target; for example, it could be a method for sending a private message, or adding a user as a friend.

#### Make methods as specific as possible

The best way to make your app secure is to understand all of the possible inputs that could come from an untrusted source, and make sure that they are all handled correctly. The easiest way to understand what inputs could come from the client is to restrict them to as small of a space as possible. This means your methods should all be specific actions, and shouldn't take a multitude of options that change the behavior in significant ways. The end goal is that you can easily look at each method in your app and validate or test that it is secure. Here's a secure example method from the Todos example app:

```js
Lists.methods.makePrivate = new Method({
  name: 'Lists.methods.makePrivate',
  schema: new SimpleSchema({
    listId: { type: String }
  }),
  run({ listId }) {
    if (!this.userId) {
      throw new Meteor.Error('Lists.methods.makePrivate.notLoggedIn',
        'Must be logged in to make private lists.');
    }

    const list = Lists.findOne(listId);

    if (list.isLastPublicList()) {
      throw new Meteor.Error('Lists.methods.makePrivate.lastPublicList',
        'Cannot make the last public list private.');
    }

    Lists.update(listId, {
      $set: { userId: this.userId }
    });

    Lists.userIdDenormalizer.set(listId, this.userId);
  }
});
```

You can see that this method does a _very spefific thing_ - it just makes a single list private. An alternative would have been to have a method called `setPrivacy`, which could set the list to private or public, but it turns out that in this particular app the security considerations for the two related operations - `makePrivate` and `makePublic` - are very different. By splitting our operations into different methods, we make each one much clearer. It's obvious from the above method definition which arguments we accept, what security checks we perform, and what operations we do on the database.

However, this doesn't mean you can't have any flexibility in your methods. Let's look at an example:

```js
const Meteor.users.methods.setUserData = new Method({
  name: 'Meteor.users.methods.setUserData',
  schema: new SimpleSchema({
    fullName: { type: String, optional: true },
    dateOfBirth: { type: Date, optional: true },
  }),
  run(fieldsToSet) {
    Meteor.users.update(this.userId, {
      $set: fieldsToSet
    });
  }
});
```

The above method is great because you can have the flexibility of having some optional fields and only passing the ones you want to change. In particular, what makes it possible for this method is that the security considerations of setting one's full name and date of birth are the same - we don't have to do different security checks for different fields being set.

#### Rate limiting: a first line of defense against brute force attacks

Since Meteor methods can easily be called from anywhere - a malicious program, script in the browser console, etc - it is easy to fire many method calls in a very short amount of time. This means it's easy for an attacker to test lots of different inputs to find one that works. Meteor has built-in rate limiting for password login to stop password brute-forcing, but it's up to you to define rate limits for your other methods.

In the Todos example app, we use the following code to set a basic rate limit on all methods:

```js
// Get list of all method names on Lists
const LISTS_METHODS = _.pluck(Lists.methods, 'name');

// Only allow 5 list operations per connection per second
DDPRateLimiter.addRule({
  name(name) {
    return _.contains(LISTS_METHODS, name);
  },

  // Rate limit per connection ID
  connectionId() { return true; }
}, 5, 1000);
```

This will make every method only callable 5 times per second. This is a rate limit that shouldn't be noticeable by the user at all, but will prevent a malicious script from totally flooding the database with requests. You will need to tune the limit parameters to match your app's needs.

Meteor's built-in rate limiter is useful in many situations; there are also community-built rate limiting packages that include additional features like reCAPTCHA integration, for example [`meteorhacks:sikka`](https://github.com/meteorhacks/sikka). XXX verify this is still a real thing

XXX decided to skip method side effects because I can't come up with a good example, and audit-argument checks because mdg:method handles it

### Publications

Publications are the primary way clients retrieve data from a Meteor server. While with Methods the primary concern was making sure users can't modify the database in unexpected ways, with publications the main issue is filtering the data being returned so that a malicious user can't get access to data they aren't supposed to see.

In a server-side-rendered framework like Ruby on Rails, it's sufficient to simply not display sensitive data in the returned HTML response. In Meteor, since the rendering is done on the client, an `if` statement in your HTML template is not secure; you need to do security at the data level to make sure that data is never sent in the first place.

#### Rules about methods still apply

All of the stuff about methods listed above applies to publications as well:

1. Validate all arguments using `check` or `aldeed:simple-schema`
1. Never pass the
1. Don't take generic arguments; make sure you know exactly what your publication is getting from the client
1. Use rate limiting to stop people from spamming you with subscriptions

#### Publications only re-run when the logged in user changes

The data publications return will often be dependent on the currently logged in user, and perhaps some properties about that user - whether they are an admin, whether they own a certain document, etc. Because of this, it's easy to accidentally write a publication that is secure when it first runs, but doesn't respond to changes in the app environment. Let's look at an example:

```js
// #1: Bad! If the owner of the list changes, the old owner will still see it
Meteor.publish('list', function (listId) {
  const list = Lists.findOne(listId);

  if (! list.userId === this.userId) {
    throw new Meteor.Error('list.unauthorized', 'This list doesn\'t belong to you.');
  }

  return Lists.find(listId);
});

// #2: Good! When the owner of the list changes, the old owner won't see it anymore
Meteor.publish('list', function (listId) {
  return Lists.find({
    _id: listId,
    userId: this.userId
  });
});
```
