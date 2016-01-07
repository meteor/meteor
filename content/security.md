---
title: "Security"
order: 8
description: How to secure your Meteor app.
---

After reading this guide, you'll know:

1. The security surface area of a Meteor app.
2. How to secure Meteor Methods, publications, and source code.
3. Where to store secret keys in development and production.
4. How to follow a security checklist when auditing your app.

<h1 id="introduction">Introduction</h1>

Securing a web application is all about understanding security domains and understanding the attack surface between these domains. In a Meteor app, things are pretty simple:

1. Code that runs on the server can be trusted.
2. Everything else: code that runs on the client, data sent through Method and publication arguments, etc, can't be trusted.

In practice, this means that you should do most of your security and validation on the boundary between these two domains. In simple terms:

1. Validate and check all inputs that come from the client.
2. Don't leak any secret information to the client.

<h2 id="attack-surface">Concept: Attack surface</h2>

Since Meteor apps are often written in a style that puts client and server code together, it's extra important to be aware what is running on the client, what is running on the server, and what the boundaries are. Here's a complete list of places security checks need to be done in a Meteor app:

1. **Methods**: Any data that comes in through Method arguments needs to be validated, and Methods should not return data the user shouldn't have access to.
2. **Publications**: Any data that comes in through publication arguments needs to be validated, and publications should not return data the user shouldn't have access to.
3. **Served files**: You should make sure none of the source code or configuration files served to the client have secret data.

Each of these points will have their own section below.

<h3 id="allow-deny">Avoid allow/deny</h3>

In this guide, we're going to take a strong position that using [allow](http://docs.meteor.com/#/full/allow) or [deny](http://docs.meteor.com/#/full/deny) to run MongoDB queries directly from the client is not a good idea. The main reason is that it is hard to follow the principles outlined above. It's extremely difficult to validate the complete space of possible MongoDB operators, which could potentially grow over time with new versions of MongoDB.

There have been several articles about the potential pitfalls of accepting MongoDB update operators from the client, in particular the [Allow & Deny Security Challenge](https://www.discovermeteor.com/blog/allow-deny-security-challenge/) and its [results](https://www.discovermeteor.com/blog/allow-deny-challenge-results/), both on the Discover Meteor blog.

Given the points above, we recommend that all Meteor apps should use Methods to accept data input from the client, and restrict the arguments accepted by each Method as tightly as possible.

Here's a code snippet to add to your server code which disables client-side updates on a collection. This will make sure no other part of your app can use `allow`:

```js
// Deny all client-side updates on the Lists collection
Lists.deny({
  insert() { return true; },
  update() { return true; },
  remove() { return true; },
});
```


<h2 id="methods">Methods</h2>

Methods are the way your Meteor server accepts inputs and data from the outside world, so it's natural that they are the most important topic for security. If you don't properly secure your Methods, users can end up modifying your database in unexpected ways - editing other people's documents, deleting data, or messing up your database schema causing the app to crash.

<h3 id="validate-arguments">Validate all arguments</h3>

It's much easier to write clean code if you can assume your inputs are correct, so it's valuable to validate all Method arguments before running any actual business logic. You don't want someone to pass a data type you aren't expecting and cause unexpected behavior.

Consider that if you are writing unit tests for your Methods, you would need to test all possible kinds of input to the Method; validating the arguments restricts the space of inputs you need to unit test, reducing the amount of code you need to write overall. It also has the extra bonus of being self-documenting; someone else can come along and read the code to find out what kinds of parameters a Method is looking for.

Just as an example, here's a situation where not checking arguments can be disastrous:

```js
Meteor.methods({
  removeWidget(id) {
    if (! this.userId) {
      throw new Meteor.Error('removeWidget.unauthorized');
    }

    Widgets.remove(id);
  }
});
```

If someone comes along and passes a non-ID selector like `{}`, they will end up deleting the entire collection.

<h3 id="validated-method">mdg:validated-method</h3>

To help you write good Methods that exhaustively validate their arguments, we've written a simple wrapper package for Methods that enforces argument validation. Read more about how to use it in the [Methods article](methods.html#validated-method). The rest of the code samples in this article will assume that you are using this package. If you aren't, you can still apply the same principles but the code will look a little different.

<h3 id="user-id-client">Don't pass userId from the client</h3>

The `this` context inside every Meteor Method has some useful information about the current connection, and the most useful is [`this.userId`](http://docs.meteor.com/#/full/method_userId). This property is managed by the DDP login system, and is guaranteed by the framework itself to be secure following widely-used best practices.

Given that the user ID of the current user is available through this context, you should never pass the ID of the current user as an argument to a Method. This would allow any client of your app to pass any user ID they want. Let's look at an example:

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

1. This is a Method only accessible by admin users, who are allowed to edit other users. See the section about [user roles](accounts.html##roles-and-permissions) to learn how to check that a user is in a certain role.
2. This Method doesn't modify the other user, but uses it as a target; for example, it could be a Method for sending a private message, or adding a user as a friend.

<h3 id="specific-action">One Method per action</h3>

The best way to make your app secure is to understand all of the possible inputs that could come from an untrusted source, and make sure that they are all handled correctly. The easiest way to understand what inputs can come from the client is to restrict them to as small of a space as possible. This means your Methods should all be specific actions, and shouldn't take a multitude of options that change the behavior in significant ways. The end goal is that you can easily look at each Method in your app and validate or test that it is secure. Here's a secure example Method from the Todos example app:

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

You can see that this Method does a _very specific thing_ - it just makes a single list private. An alternative would have been to have a Method called `setPrivacy`, which could set the list to private or public, but it turns out that in this particular app the security considerations for the two related operations - `makePrivate` and `makePublic` - are very different. By splitting our operations into different Methods, we make each one much clearer. It's obvious from the above Method definition which arguments we accept, what security checks we perform, and what operations we do on the database.

However, this doesn't mean you can't have any flexibility in your Methods. Let's look at an example:

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

The above Method is great because you can have the flexibility of having some optional fields and only passing the ones you want to change. In particular, what makes it possible for this Method is that the security considerations of setting one's full name and date of birth are the same - we don't have to do different security checks for different fields being set. Note that it's very important that the `$set` query on MongoDB is generated on the server - we should never take MongoDB operators as-is from the client, since they are hard to validate and could result in unexpected side effects.

<h4 id="reusing-security-rules">Refactoring to reuse security rules</h4>

You might run into a situation where many Methods in your app have the same security checks. This can be simplified by factoring out the security into a separate module, wrapping the Method body, or extending the `Mongo.Collection` class to do security inside the `insert`, `update`, and `remove` implementations on the server. However, implementing your client-server communication via specific Methods is still a good idea rather than sending arbitrary `update` operators from the client, since a malicious client can't send an `update` operator that you didn't test for.

<h3 id="rate-limiting">Rate limiting</h3>

Just like REST endpoints, Meteor Methods can easily be called from anywhere - a malicious program, script in the browser console, etc. It is easy to fire many Method calls in a very short amount of time. This means it can be easy for an attacker to test lots of different inputs to find one that works. Meteor has built-in rate limiting for password login to stop password brute-forcing, but it's up to you to define rate limits for your other Methods.

In the Todos example app, we use the following code to set a basic rate limit on all Methods:

```js
// Get list of all Method names on Lists
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

This will make every Method only callable 5 times per second per connection. This is a rate limit that shouldn't be noticeable by the user at all, but will prevent a malicious script from totally flooding the server with requests. You will need to tune the limit parameters to match your app's needs.

<h2 id="publications">Publications</h2>

Publications are the primary way a Meteor server can make data available to a client. While with Methods the primary concern was making sure users can't modify the database in unexpected ways, with publications the main issue is filtering the data being returned so that a malicious user can't get access to data they aren't supposed to see.

#### You can't do security at the rendering layer

In a server-side-rendered framework like Ruby on Rails, it's sufficient to simply not display sensitive data in the returned HTML response. In Meteor, since the rendering is done on the client, an `if` statement in your HTML template is not secure; you need to do security at the data level to make sure that data is never sent in the first place.

<h3 id="method-rules">Rules about Methods still apply</h3>

All of the points above about Methods apply to publications as well:

1. Validate all arguments using `check` or `aldeed:simple-schema`.
1. Never pass the current user ID as an argument.
1. Don't take generic arguments; make sure you know exactly what your publication is getting from the client.
1. Use rate limiting to stop people from spamming you with subscriptions.

<h3 id="fields">Always restrict fields</h3>

[`Mongo.Collection#find` has an option called `fields`](http://docs.meteor.com/#/full/find) which lets you filter the fields on the fetched documents. You should always use this in publications to make sure you don't accidentally publish secret fields.

For example, you could write a publication, then later add a secret field to the published collection. Now, the publication would be sending that secret to the client. If you filter the fields on every publication when you first write it, then adding another field won't automatically publish it.

```js
// #1: Bad! If we add a secret field to Lists later, the client
// will see it
Meteor.publish('Lists.public', function () {
  return Lists.find({userId: {$exists: false}});
});

// #2: Good, if we add a secret field to Lists later, the client
// will only publish it if we add it to the list of fields
Meteor.publish('Lists.public', function () {
  return Lists.find({userId: {$exists: false}}, {
    fields: {
      name: 1,
      incompleteCount: 1,
      userId: 1
    }
  });
});
```

If you find yourself repeating the fields often, it makes sense to factor out a dictionary of public fields that you can always filter by, like so:

```js
// In the file where Lists is defined
Lists.publicFields = {
  name: 1,
  incompleteCount: 1,
  userId: 1
};
```

Now your code becomes a bit simpler:

```js
Meteor.publish('Lists.public', function () {
  return Lists.find({userId: {$exists: false}}, {
    fields: Lists.publicFields
  });
});
```

<h3 id="publications-user-id">Publications and userId</h3>

The data returned from publications will often be dependent on the currently logged in user, and perhaps some properties about that user - whether they are an admin, whether they own a certain document, etc.

Publications are not reactive, and they only re-run when the currently logged in `userId` changes, which can be accessed through `this.userId`. Because of this, it's easy to accidentally write a publication that is secure when it first runs, but doesn't respond to changes in the app environment. Let's look at an example:

```js
// #1: Bad! If the owner of the list changes, the old owner will still see it
Meteor.publish('list', function (listId) {
  check(listId, String);

  const list = Lists.findOne(listId);

  if (! list.userId === this.userId) {
    throw new Meteor.Error('list.unauthorized',
      'This list doesn\'t belong to you.');
  }

  return Lists.find(listId, {
    fields: {
      name: 1,
      incompleteCount: 1,
      userId: 1
    }
  });
});

// #2: Good! When the owner of the list changes, the old owner won't see it anymore
Meteor.publish('list', function (listId) {
  check(listId, String);

  return Lists.find({
    _id: listId,
    userId: this.userId
  }, {
    fields: {
      name: 1,
      incompleteCount: 1,
      userId: 1
    }
  });
});
```

In the first example, if the `userId` property on the selected list changes, the query in the publication will still return the data, since the security check in the beginning will not re-run. In the second example, we have fixed this by putting the security check in the returned query itself.

Unfortunately, not all publications are as simple to secure as the example above. For more tips on how to use `reywood:publish-composite` to handle reactive changes in publications, see the [data loading article](data-loading.html#complex-auth).

<h3 id="publication-options">Passing options</h3>

For certain applications, for example pagination, you'll want to pass options into the publication to control things like how many documents should be sent to the client. There are some extra considerations to keep in mind for this particular case.

1. **Passing a limit**: In the case where you are passing the `limit` option of the query from the client, make sure to set a maximum limit. Otherwise, a malicious client could request too many documents at once, which could raise performance issues.
2. **Passing in a filter**: If you want to pass fields to filter on because you don't want all of the data, for example in the case of a search query, make sure to use MongoDB `$and` to intersect the filter coming from the client with the documents that client should be allowed to see. Also, you should whitelist the keys that the client can use to filter - if the client can filter on secret data, it can run a search to find out what that data is.
3. **Passing in fields**: If you want the client to be able to decide which fields of the collection should be fetched, make sure to intersect that with the fields that client is allowed to see, so that you don't accidentally send secret data to the client.

In summary, you should make sure that any options passed from the client to a publication can only restrict the data being requested, rather than extending it.

<h2 id="served-files">Served files</h2>

Publications are not the only place the client gets data from the server. The set of source code files and static assets that are served by your application server could also potentially contain sensitive data:

1. Business logic an attacker could analyze to find weak points.
1. Secret algorithms that a competitor could steal.
1. Secret API keys.

<h3 id="secret-code">Secret server code</h3>

While the client-side code of your application is necessarily accessible by the browser, every application will have some secret code on the server that you don't want to share with the world.

Secret business logic in your app should be located in code that is only loaded on the server. This means it is in a `server/` directory of your app, in a package that is only included on the server, or in a file inside a package that was loaded only on the server.

If you have a Meteor Method in your app that has secret business logic, you might want to split the Method into two functions - the optimistic UI part that will run on the client, and the secret part that runs on the server. Most of the time, putting the entire Method on the server doesn't result in the best user experience. Let's look at an example, where you have a secret algorithm for calculating someone's MMR (ranking) in a game:

```js
// In a server-only file
MMR = {
  updateWithSecretAlgorithm(userId) {
    // your secret code here
  }
}
```

```js
// In a file loaded on client and server
const Meteor.users.methods.updateMMR = new Method({
  name: 'Meteor.users.methods.updateMMR',
  validate: null,
  run() {
    if (this.isSimulation) {
      // Simulation code for the client (optional)
    } else {
      MMR.updateWithSecretAlgorithm(this.userId);
    }
  }
});
```

Note that while the Method is defined on the client, the actual secret logic is only accessible from the server. Keep in mind that code inside `if (Meteor.isServer)` blocks is still sent to the client, it is just not executed. So don't put any secret code in there.

Secret API keys should never be stored in your source code at all, the next section will talk about how to handle them.

<h2 id="api-keys">Securing API keys</h2>

Every app will have some secret API keys or passwords:

1. Your database password.
1. API keys for external APIs.

These should never be stored as part of your app's source code in version control, because developers might copy code around to unexpected places and forget that it contains secret keys. You can keep your keys separately in [Dropbox](https://www.dropbox.com/), [LastPass](https://lastpass.com), or another service, and then reference them when you need to deploy the app.

You can pass settings to your app through a _settings file_ or an _environment variable_. Most of your app settings should be in JSON files that you pass in when starting your app. You can start your app with a settings file by passing the `--settings` flag:

```sh
# Pass development settings when running your app locally
meteor --settings development.json

# Pass production settings when deploying your app
meteor deploy myapp.com --settings production.json
```

Here's what a settings file with some API keys might look like:

```js
{
  "facebook": {
    "clientId": "12345",
    "secret": "1234567"
  }
}
```

In your app's JavaScript code, these settings can be accessed from the variable `Meteor.settings`.

[Read more about managing keys and settings in the Deployment article.](#environment)

<h3 id="client-settings">Settings on the client</h3>

In most normal situations, API keys from your settings file will only be used by the server, and by default the data passed in through `--settings` is only available on the server. However, if you put data under a special key called `public`, it will be available on the client. You might want to do this if, for example, you need to make an API call from the client and are OK with users knowing that key. Public settings will be available on the client under `Meteor.settings.public`.

<h3 id="api-keys-oauth">API keys for OAuth</h3>

For the `accounts-facebook` package to pick up these keys, you need to add them to the service configuration collection in the database. Here's how you do that:

First, add the `service-configuration` package:

```sh
meteor add service-configuration
```

Then, upsert into the `ServiceConfiguration` collection:

```js
ServiceConfiguration.configurations.upsert({
  service: "facebook"
}, {
  $set: {
    clientId: Meteor.settings.facebook.clientId,
    loginStyle: "popup",
    secret: Meteor.settings.facebook.secret
  }
});
```

Now, `accounts-facebook` will be able to find that API key and Facebook login will work properly.

<h2 id="ssl">SSL</h2>

This is a very short section, but it deserves its own place in the table of contents.

**Every production Meteor app that handles user data should run with SSL.**

For the uninitiated, this means all of your HTTP requests should go over HTTPS, and all websocket data should be sent over WSS.

Yes, Meteor does hash your password or login token on the client before sending it over the wire, but that only prevents an attacker from figuring out your password - it doesn't prevent them from logging in as you, since they could just send the hashed password to the server to log in! No matter how you slice it, logging in requires the client to send sensitive data  to the server, and the only way to secure that transfer is by using SSL. Note that the same issue is present when using cookies for authentication in a normal HTTP web application, so any app that needs to reliably identify users should be running on SSL.

You can ensure that any unsecured connection to your app redirects to a secure connection by adding the `force-ssl` package.

#### Setting up SSL

1. On `meteor deploy` free hosting, [just add `force-ssl`](deployment.html#free-hosting) and you're good to go
2. On [Galaxy](deployment.html#galaxy), most things are set up for you, but you need to add a certificate. [See the help article about SSL on Galaxy](https://galaxy.meteor.com/help/using-ssl).
3. If you are running on your own [infrastructure](deployment.html#custom-deployment), there are a few options for setting up SSL, mostly through configuring a proxy web server. See the articles: [Josh Owens on SSL and Meteor](http://joshowens.me/ssl-and-meteor-js/), [SSL on Meteorpedia](http://www.meteorpedia.com/read/SSL), and [Digital Ocean tutorial with an Nginx config](https://www.digitalocean.com/community/tutorials/how-to-deploy-a-meteor-js-application-on-ubuntu-14-04-with-nginx).

<h2 id="checklist">Security checklist</h2>

This is a collection of points to check about your app that might catch common errors. However, it's not an exhaustive list yet---if we missed something, please let us know or file a pull request!

1. Make sure your app doesn't have the `insecure` or `autopublish` packages.
1. Validate all Method and publication arguments, and include the `audit-argument-checks` to check this automatically.
1. [Deny writes to the `profile` field on user documents.](accounts.html#dont-use-profile)
1. [Use Methods instead of client-side insert/update/remove and allow/deny.](security.html#allow-deny)
1. Use specific selectors and [filter fields](http://guide.meteor.com/security.html#fields) in publications.
1. Don't use [raw HTML inclusion in Blaze](blaze.html#rendering-html) unless you really know what you are doing.
1. [Make sure secret API keys and passwords aren't in your source code.](security.html#api-keys)
1. Secure the data, not the UI - redirecting away from a client-side route does nothing for security, it's just a nice UX feature.
1. [Don't ever trust user IDs passed from the client.](http://guide.meteor.com/security.html#user-id-client) Use `this.userId` inside Methods and publications.
1. Set up [browser policy](https://atmospherejs.com/meteor/browser-policy), but know that not all browsers support it so it just provides an extra layer of security to users with modern browsers.
