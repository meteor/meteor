# Users and Accounts

## Features in core Meteor

Before we get into all of the different user-facing accounts functionality you can add with Meteor, let's go over some of the features built into the Meteor DDP protocol and `accounts-base` package. These are the parts of Meteor that you'll definitely need to be aware of if you have any user accounts in your app; most of everything else is optional and added/removed via packages.

### userId in DDP

DDP is Meteor's built-in pub/sub and RPC protocol. You can read about how to use it in the [Data Loading](data-loading.html) and [Methods](methods.html) chapters. In addition to the concepts of data loading and remote method calls, DDP has one more feature built in - the idea of a `userId` field on a connection. This is the place where login state is tracked, regardless of which accounts UI package or login service you are using.

This built-in feature means that you always get `this.userId` inside Methods and Publications, and can access the user ID on the client. This is a great starting point for building your own custom accounts system, but most developers won't need to worry about the mechanics, since you'll mostly be interacting with the `accounts-base` package instead.

### `accounts-base`

This package is the core of Meteor's developer-facing user accounts functionality. This includes:

1. A users collection with a standard schema, accessed through [`Meteor.users`](http://docs.meteor.com/#/full/meteor_users), and the client-side singletons [`Meteor.userId()`](http://docs.meteor.com/#/full/meteor_userid) and [`Meteor.user()`](http://docs.meteor.com/#/full/meteor_user), which represent the login state on the client
2. A variety of helpful other generic methods to keep track of login state, log out, validate users, etc. Visit the [Accounts section of the docs](http://docs.meteor.com/#/full/accounts_api) to find a complete list.
3. An API for registering new login handlers, which is used by all of the other accounts packages to integrate with the accounts system. There isn't any official documentation for this API, but you can [read more about it on the MeteorHacks blog](https://meteorhacks.com/extending-meteor-accounts).

Usually, you don't need to include `accounts-base` yourself since it's added for you if you use `accounts-password` or similar, but it's good to be aware of what is what.

## Fast prototyping with `accounts-ui`

Often, a complicated accounts system is not the first thing you want to build when you're starting out with a new app, so it's useful to have something you can just drop in quickly. This is where `accounts-ui` comes in - it's just one line that you drop into your app to get an accounts system. To add it:

```js
meteor add accounts-ui
```

Then just include it anywhere in a Blaze template:

```html
{{> loginButtons}}
```

Then, make sure to pick a login provider; they will automatically integrate with `accounts-ui`:

```sh
# pick one or more of the below
meteor add accounts-password
meteor add accounts-facebook
meteor add accounts-google
meteor add accounts-github
meteor add accounts-twitter
meteor add accounts-meetup
meteor add accounts-meteor-developer
```

[XXX screenshot of accounts ui in action]

Now just open your app, follow the configuration steps, and you're good to go - if you've done the [Meteor tutorial](https://www.meteor.com/tutorials/blaze/adding-user-accounts), you've already seen this in action. Of course, in a production application, you probably want a more custom user interface and some logic to have a more tailored UX, but that's why we have the rest of this guide.

## Password login

Meteor comes with a secure and fully-featured password login system out of the box. To use it, add the package:

```sh
meteor add accounts-password
```

To see what options are available to you, read the complete description of the [`accounts-password` API in the Meteor docs](http://docs.meteor.com/#/full/accounts_passwords).

### Requiring username, email, or both

Be default, the `Accounts.createUser` function provided by `accounts-password` allows you to create an account with a username, email, or both. Most apps expect a specific combination of the two, so you will certainly want to validate the new user creation:

```js
// Ensuring every user has an email address, should be in server-side code
// XXX should we use simple-schema here??
Accounts.validateNewUser((user) => {
  if (! user.email) {
    throw new Meteor.Error('Meteor.users.needEmail',
      'All users must have an email address.');
  }

  if (! user.username) {
    throw new Meteor.Error('Meteor.users.needUsername',
      'All users must have a username.');
  }

  // Return true to allow user creation to proceed
  return true;
});
```

### Dealing with multiple email addresses

Often, users might want to associate multiple email addresses with the same account. `accounts-password` addresses this case by storing the email addresses as an array in the user collection. There are some handy API methods to deal with [adding](http://docs.meteor.com/#/full/Accounts-addEmail), [removing](http://docs.meteor.com/#/full/Accounts-removeEmail), and [verifying](http://docs.meteor.com/#/full/accounts_verifyemail) emails.

One useful thing to add for your app can be the concept of a "primary" email address. This way, if the user has added multiple emails, you know where to send confirmation emails and similar.

### Case sensitivity

Before Meteor 1.2, all email addresses and usernames in the database were considered to be case-sensitive. This meant that if you registered an account as `AdaLovelace@example.com`, and then tried to log in with `adalovelace@example.com`, you'd see an error indicating that no user with that email exists. Of course, this can be quite confusing, so we decided to improve things in Meteor 1.2. But the situation was not as simple as it seemed; since MongoDB doesn't have a concept of case-insensitive indexes, it was impossible to guarantee unique emails at the database level. For this reason, we have added a bunch of new APIs for querying and updating users which manage the case-sensitivity problem at the application level.

#### What does this mean for my app?

Just follow one simple rule: don't query the database by `username` or `email` directly. Instead, use the [`Accounts.findUserByUsername`](http://docs.meteor.com/#/full/Accounts-findUserByUsername) and [`Accounts.findUserByEmail`](http://docs.meteor.com/#/full/Accounts-findUserByEmail) methods provided by Meteor. This will run a query for you that is case-insensitive, so you will always find the user you are looking for.

### Email flows

When you have a login system for your app based on user emails, that opens up the possibility for email-based account flows:

1. Password reset
1. User enrollment
1. Email verification

The common thing between all of these workflows is that they involve sending a unique link to the user's email address, which does something special when it is clicked.
