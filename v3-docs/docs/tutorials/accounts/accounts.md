# Users and Accounts

After reading this article, you'll know:

1. What features in core Meteor enable user accounts
2. How to use accounts-ui for a quick prototype
3. How to build a fully-featured password login experience
4. How to enable login through OAuth providers like Facebook
5. How to add custom data to Meteor's users collection
6. How to manage user roles and permissions

## Features in core Meteor

Before we get into all of the different user-facing accounts functionality you can add with Meteor, let's go over some of the features built into the Meteor DDP protocol and `accounts-base` package. These are the parts of Meteor that you'll definitely need to be aware of if you have any user accounts in your app; most of everything else is optional and added/removed via packages.

### userId in DDP

DDP is Meteor's built-in pub/sub and RPC protocol. You can read about how to use it in the [Data Loading](/tutorials/data-loading/data-loading) and [Methods](/tutorials/methods/methods) articles. In addition to the concepts of data loading and method calls, DDP has one more feature built in - the idea of a `userId` field on a connection. This is the place where login state is tracked, regardless of which accounts UI package or login service you are using.

This built-in feature means that you always get `this.userId` inside Methods and Publications, and can access the user ID on the client. This is a great starting point for building your own custom accounts system, but most developers won't need to worry about the mechanics, since you'll mostly be interacting with the `accounts-base` package instead.

### accounts-base

This package is the core of Meteor's developer-facing user accounts functionality. This includes:

1. A users collection with a standard schema, accessed through [`Meteor.users`](/api/accounts#Meteor-users), and the client-side singletons [`Meteor.userId()`](/api/accounts#Meteor-userId) and [`Meteor.user()`](/api/accounts#Meteor-user), which represent the login state on the client.
2. A variety of helpful other generic methods to keep track of login state, log out, validate users, etc. Visit the [Accounts section of the docs](/api/accounts) to find a complete list.
3. An API for registering new login handlers, which is used by all of the other accounts packages to integrate with the accounts system.

Usually, you don't need to include `accounts-base` yourself since it's added for you if you use `accounts-password` or similar, but it's good to be aware of what is what.

## Fast prototyping with accounts-ui

Often, a complicated accounts system is not the first thing you want to build when you're starting out with a new app, so it's useful to have something you can drop in quickly. This is where `accounts-ui` comes in - it's one line that you drop into your app to get an accounts system. To add it:

```bash
meteor add accounts-ui
```

Then include it anywhere in a Blaze template:

```html
{{> loginButtons}}
```

Then, make sure to pick a login provider; they will automatically integrate with `accounts-ui`:

```bash
# pick one or more of the below
meteor add accounts-password
meteor add accounts-facebook
meteor add accounts-google
meteor add accounts-github
meteor add accounts-twitter
meteor add accounts-meetup
meteor add accounts-meteor-developer
```

Now open your app, follow the configuration steps, and you're good to go - if you've done one of our [Meteor tutorials](/tutorials/react/1.creating-the-app), you've already seen this in action. Of course, in a production application, you probably want a more custom user interface and some logic to have a more tailored UX, but that's why we have the rest of these tutorials.

## Password login

Meteor comes with a secure and fully-featured password login system out of the box. To use it, add the package:

```bash
meteor add accounts-password
```

To see what options are available to you, read the complete description of the [`accounts-password` API in the Meteor docs](/api/accounts).

### Requiring username or email

By default, the `Accounts.createUser` function provided by `accounts-password` allows you to create an account with a username, email, or both. Most apps expect a specific combination of the two, so you will certainly want to validate the new user creation:

```js
// Ensuring every user has an email address, should be in server-side code
Accounts.validateNewUser((user) => {
  new SimpleSchema({
    _id: { type: String },
    emails: { type: Array },
    'emails.$': { type: Object },
    'emails.$.address': { type: String },
    'emails.$.verified': { type: Boolean },
    createdAt: { type: Date },
    services: { type: Object, blackbox: true }
  }).validate(user);

  // Return true to allow user creation to proceed
  return true;
});
```

### Multiple emails

Often, users might want to associate multiple email addresses with the same account. `accounts-password` addresses this case by storing the email addresses as an array in the user collection. There are some handy API methods to deal with [adding](/api/accounts#Accounts-addEmail), [removing](/api/accounts#Accounts-removeEmail), and [verifying](/api/accounts#Accounts-verifyEmail) emails.

One useful thing to add for your app can be the concept of a "primary" email address. This way, if the user has added multiple emails, you know where to send confirmation emails and similar.

### Case sensitivity

Meteor handles case sensitivity for email addresses and usernames. Since MongoDB doesn't have a concept of case-insensitive indexes, it was impossible to guarantee unique emails at the database level. For this reason, we have some special APIs for querying and updating users which manage the case-sensitivity problem at the application level.

**What does this mean for your app?**

Follow one rule: don't query the database by `username` or `email` directly. Instead, use the [`Accounts.findUserByUsername`](/api/accounts#Accounts-findUserByUsername) and [`Accounts.findUserByEmail`](/api/accounts#Accounts-findUserByEmail) methods provided by Meteor. This will run a query for you that is case-insensitive, so you will always find the user you are looking for.

### Email flows

When you have a login system for your app based on user emails, that opens up the possibility for email-based account flows. The common thing between all of these workflows is that they involve sending a unique link to the user's email address, which does something special when it is clicked. Let's look at some common examples that Meteor's `accounts-password` package supports out of the box:

1. **Password reset.** When the user clicks the link in their email, they are taken to a page where they can enter a new password for their account.
2. **User enrollment.** A new user is created by an administrator, but no password is set. When the user clicks the link in their email, they are taken to a page where they can set a new password for their account.
3. **Email verification.** When the user clicks the link in their email, the application records that this email does indeed belong to the correct user.

#### Sending the email

`accounts-password` comes with handy functions that you can call from the server to send an email:

1. [`Accounts.sendResetPasswordEmail`](/api/accounts#Accounts-sendResetPasswordEmail)
2. [`Accounts.sendEnrollmentEmail`](/api/accounts#Accounts-sendEnrollmentEmail)
3. [`Accounts.sendVerificationEmail`](/api/accounts#Accounts-sendVerificationEmail)

The email is generated using the email templates from [`Accounts.emailTemplates`](/api/accounts#Accounts-emailTemplates), and include links generated with `Accounts.urls`.

#### Identifying when the link is clicked

When the user receives the email and clicks the link inside, their web browser will take them to your app. Now, you need to be able to identify these special links and act appropriately. If you haven't customized the link URL, then you can use some built-in callbacks to identify when the app is in the middle of an email flow:

1. [`Accounts.onResetPasswordLink`](/api/accounts#Accounts-onResetPasswordLink)
2. [`Accounts.onEnrollmentLink`](/api/accounts#Accounts-onEnrollmentLink)
3. [`Accounts.onEmailVerificationLink`](/api/accounts#Accounts-onEmailVerificationLink)

Here's how you would use one of these functions:

```js
Accounts.onResetPasswordLink(async (token, done) => {
  // Display the password reset UI, get the new password...

  try {
    await Accounts.resetPasswordAsync(token, newPassword);
    // Resume normal operation
    done();
  } catch (err) {
    // Display error
    console.error('Password reset failed:', err);
  }
});
```

If you want a different URL for your reset password page, you need to customize it using the `Accounts.urls` option:

```js
Accounts.urls.resetPassword = (token) => {
  return Meteor.absoluteUrl(`reset-password/${token}`);
};
```

If you have customized the URL, you will need to add a new route to your router that handles the URL you have specified.

#### Completing the process

When the user submits the form, you need to call the appropriate function to commit their change to the database:

1. [`Accounts.resetPasswordAsync`](/api/accounts#Accounts-resetPassword) - this one should be used both for resetting the password, and enrolling a new user; it accepts both kinds of tokens.
2. [`Accounts.verifyEmailAsync`](/api/accounts#Accounts-verifyEmail)

After you have called one of the two functions above or the user has cancelled the process, call the `done` function you got in the link callback.

### Customizing accounts emails

You will probably want to customize the emails `accounts-password` will send on your behalf. This can be done through the [`Accounts.emailTemplates` API](/api/accounts#Accounts-emailTemplates). Below is some example code:

```js
Accounts.emailTemplates.siteName = "Meteor Guide Todos Example";
Accounts.emailTemplates.from = "Meteor Todos Accounts <accounts@example.com>";

Accounts.emailTemplates.resetPassword = {
  subject(user) {
    return "Reset your password on Meteor Todos";
  },
  text(user, url) {
    return `Hello!
Click the link below to reset your password on Meteor Todos.
${url}
If you didn't request this email, please ignore it.
Thanks,
The Meteor Todos team
`;
  },
  html(user, url) {
    // This is where HTML email content would go.
    // See the section about html emails below.
  }
};
```

#### HTML emails

If you've ever needed to deal with sending pretty HTML emails from an app, you know that it can quickly become a nightmare. Compatibility of popular email clients with basic HTML features like CSS is notoriously spotty. Start with a [responsive email template](https://github.com/leemunroe/responsive-html-email-template) or [framework](https://get.foundation/emails), and then use a tool to convert your email content into something that is compatible with all email clients.

## OAuth login

Meteor supports popular login providers through OAuth out of the box.

### Facebook, Google, and more

Here's a complete list of login providers for which Meteor actively maintains core packages:

1. Facebook with `accounts-facebook`
2. Google with `accounts-google`
3. GitHub with `accounts-github`
4. Twitter with `accounts-twitter`
5. Meetup with `accounts-meetup`
6. Meteor Developer Accounts with `accounts-meteor-developer`

### Logging in

If you are using an off-the-shelf login UI like `accounts-ui`, you don't need to write any code after adding the relevant package. If you are building a login experience from scratch, you can log in programmatically using the [`Meteor.loginWith<Service>`](/api/accounts#Meteor-loginWithExternalService) function:

```js
try {
  await Meteor.loginWithFacebookAsync({
    requestPermissions: ['user_friends', 'public_profile', 'email']
  });
  // successful login!
} catch (err) {
  // handle error
  console.error('Login failed:', err);
}
```

### Configuring OAuth

There are a few points to know about configuring OAuth login:

1. **Client ID and secret.** It's best to keep your OAuth secret keys outside of your source code, and pass them in through Meteor.settings. Read how in the [Security article](/tutorials/security/security#api-keys).
2. **Redirect URL.** On the OAuth provider's side, you'll need to specify a *redirect URL*. The URL will look like: `https://www.example.com/_oauth/facebook`. Replace `facebook` with the name of the service you are using. Note that you will need to configure two URLs - one for your production app, and one for your development environment, where the URL might be something like `http://localhost:3000/_oauth/facebook`.
3. **Permissions.** Each login service provider should have documentation about which permissions are available. If you want additional permissions to the user's data when they log in, pass some of these strings in the `requestPermissions` option.

### Calling service API for more data

If your app supports or even requires login with an external service such as Facebook, it's natural to also want to use that service's API to request additional data about that user.

First, you'll need to request the relevant permissions when logging in the user.

Then, you need to get the user's access token. You can find this token in the `Meteor.users` collection under the `services` field:

```js
// Given a userId, get the user's Facebook access token
const user = await Meteor.users.findOneAsync(userId);
const fbAccessToken = user.services.facebook.accessToken;
```

Now that you have the access token, you can use the `fetch` API or an npm package to access the service's API directly.

## Loading and displaying user data

Meteor's accounts system, as implemented in `accounts-base`, also includes a database collection and generic functions for getting data about users.

### Currently logged in user

Once a user is logged into your app with one of the methods described above, it is useful to be able to identify which user is logged in, and get the data provided during the registration process.

#### On the client: Meteor.userId()

For code that runs on the client, the global `Meteor.userId()` reactive function will give you the ID of the currently logged in user.

In addition to that core API, there are some helpful shorthand helpers: `Meteor.user()`, which is exactly equal to calling `Meteor.users.findOne(Meteor.userId())`, and the <span v-pre>`{{currentUser}}`</span> Blaze helper that returns the value of `Meteor.user()`.

#### On the server: this.userId

On the server, each connection has a different logged in user, so there is no global logged-in user state by definition. We suggest using the `this.userId` property on the context of Methods and publications, and passing that around through function arguments to wherever you need it.

```js
// Accessing this.userId inside a publication
Meteor.publish('lists.private', function() {
  if (!this.userId) {
    return this.ready();
  }

  return Lists.find({
    userId: this.userId
  }, {
    fields: Lists.publicFields
  });
});
```

```js
// Accessing this.userId inside a Method
Meteor.methods({
  async 'todos.updateText'({ todoId, newText }) {
    new SimpleSchema({
      todoId: { type: String },
      newText: { type: String }
    }).validate({ todoId, newText });

    const todo = await Todos.findOneAsync(todoId);

    if (!todo.editableBy(this.userId)) {
      throw new Meteor.Error('todos.updateText.unauthorized',
        'Cannot edit todos in a private list that is not yours');
    }

    await Todos.updateAsync(todoId, {
      $set: { text: newText }
    });
  }
});
```

### The Meteor.users collection

Meteor comes with a default MongoDB collection for user data. It's stored in the database under the name `users`, and is accessible in your code through `Meteor.users`. The schema of a user document in this collection will depend on which login service was used to create the account.

Here's an example of a user that created their account with `accounts-password`:

```js
{
  "_id": "DQnDpEag2kPevSdJY",
  "createdAt": "2015-12-10T22:34:17.610Z",
  "services": {
    "password": {
      "bcrypt": "XXX"
    },
    "resume": {
      "loginTokens": [
        {
          "when": "2015-12-10T22:34:17.615Z",
          "hashedToken": "XXX"
        }
      ]
    }
  },
  "emails": [
    {
      "address": "ada@lovelace.com",
      "verified": false
    }
  ]
}
```

Here's what the same user would look like if they instead logged in with Facebook:

```js
{
  "_id": "Ap85ac4r6Xe3paeAh",
  "createdAt": "2015-12-10T22:29:46.854Z",
  "services": {
    "facebook": {
      "accessToken": "XXX",
      "expiresAt": 1454970581716,
      "id": "XXX",
      "email": "ada@lovelace.com",
      "name": "Ada Lovelace",
      "first_name": "Ada",
      "last_name": "Lovelace"
    },
    "resume": {
      "loginTokens": [...]
    }
  }
}
```

Note that the schema is different when users register with different login services. There are a few things to be aware of when dealing with this collection:

1. User documents in the database have secret data like access keys and hashed passwords. When [publishing user data to the client](#publishing-custom-data), be extra careful not to include anything that client shouldn't be able to see.
2. DDP, Meteor's data publication protocol, only knows how to resolve conflicts in top-level fields. This means that you can't have one publication send `services.facebook.first_name` and another send `services.facebook.locale` - one of them will win. The best way to fix this is to denormalize the data you want onto custom top-level fields.
3. When finding users by email or username, make sure to use the case-insensitive functions provided by `accounts-password`.

## Custom data about users

As your app gets more complex, you will invariably need to store some data about individual users, and the most natural place to put that data is in additional fields on the `Meteor.users` collection.

### Add top-level fields onto the user document

The best way to store your custom data onto the `Meteor.users` collection is to add a new uniquely-named top-level field on the user document:

```js
// Using address schema from schema.org
const newMailingAddress = {
  addressCountry: 'US',
  addressLocality: 'Seattle',
  addressRegion: 'WA',
  postalCode: '98052',
  streetAddress: "20341 Whitworth Institute 405 N. Whitworth"
};

await Meteor.users.updateAsync(userId, {
  $set: {
    mailingAddress: newMailingAddress
  }
});
```

You can use any field name other than those [used by the Accounts system](/api/accounts#Meteor-users).

### Adding fields on user registration

Sometimes, you want to set a field when the user first creates their account. You can do this using [`Accounts.onCreateUser`](/api/accounts#Accounts-onCreateUser):

```js
// Generate user initials after Facebook login
Accounts.onCreateUser((options, user) => {
  if (!user.services.facebook) {
    throw new Error('Expected login with Facebook only.');
  }

  const { first_name, last_name } = user.services.facebook;
  user.initials = first_name[0].toUpperCase() + last_name[0].toUpperCase();

  // We still want the default hook's 'profile' behavior.
  if (options.profile) {
    user.profile = options.profile;
  }

  // Don't forget to return the new user object at the end!
  return user;
});
```

Note that the `user` object provided doesn't have an `_id` field yet. If you need to do something with the new user's ID inside this function, you can generate the ID yourself:

```js
import { Random } from 'meteor/random';

// Generate a todo list for each new user
Accounts.onCreateUser(async (options, user) => {
  // Generate a user ID ourselves
  user._id = Random.id();

  // Use the user ID we generated
  await Lists.createListForUser(user._id);

  // Don't forget to return the new user object at the end!
  return user;
});
```

### Don't use profile

There's a tempting existing field called `profile` that is added by default when a new user registers. This field was historically intended to be used as a scratch pad for user-specific data. Because of this, **the `profile` field on every user is automatically writeable by that user from the client**. It's also automatically published to the client for that particular user.

It turns out that having a field writeable by default without making that super obvious might not be the best idea. There are many stories of new Meteor developers storing fields such as `isAdmin` on `profile`... and then a malicious user can set that to true whenever they want, making themselves an admin.

Rather than dealing with the specifics of this field, it can be helpful to ignore its existence entirely. You can safely do that as long as you deny all writes from the client:

```js
// Deny all client-side updates to user documents
Meteor.users.deny({
  update() { return true; }
});
```

### Publishing custom data

If you want to access the custom data you've added to the `Meteor.users` collection in your UI, you'll need to publish it to the client. The most important thing to keep in mind is that user documents contain private data about your users—hashed passwords and access keys for external APIs. This means it's critically important to filter the fields of the user document that you send to any client.

```js
Meteor.publish('Meteor.users.initials', function ({ userIds }) {
  // Validate the arguments to be what we expect
  new SimpleSchema({
    userIds: { type: Array },
    'userIds.$': { type: String }
  }).validate({ userIds });

  // Select only the users that match the array of IDs passed in
  const selector = {
    _id: { $in: userIds }
  };

  // Only return one field, `initials`
  const options = {
    fields: { initials: 1 }
  };

  return Meteor.users.find(selector, options);
});
```

### Preventing unnecessary data retrieval

Take care storing lots of custom data on the user document, particularly data which grows indefinitely, because by default the entire user document is fetched from the database whenever a user tries to log in or out.

A new `options` parameter was added to some methods which retrieves a user document. This parameter can include a [mongo field specifier](/api/collections#fieldspecifiers) to include or omit specific fields from the query:

```js
// fetch only the user's name from the database:
const user = await Meteor.userAsync({ fields: { "profile.name": 1 } });
const name = user?.profile?.name;

// check if an email exists without fetching their entire document:
const userExists = !!await Accounts.findUserByEmail(email, { fields: { _id: 1 } });

// get the user id from a userName:
const user = await Accounts.findUserByUsername(userName, { fields: { _id: 1 } });
const userId = user?._id;
```

You can also use [`Accounts.config({defaultFieldSelector: {...}})`](/api/accounts#AccountsCommon-config) to include or omit specific user fields by default:

```js
Accounts.config({
  defaultFieldSelector: {
    username: 1,
    emails: 1,
    createdAt: 1,
    profile: 1,
    services: 1,
  }
});
```

Or omit fields with large amounts of data:

```js
Accounts.config({ defaultFieldSelector: { myBigArray: 0 } });
```

## Roles and permissions

One of the main reasons you might want to add a login system to your app is to have permissions for your data. For example, if you were running a forum, you would want administrators or moderators to be able to delete any post, but normal users can only delete their own. This uncovers two different types of permissions:

1. Role-based permissions
2. Per-document permissions

### alanning:roles

The most popular package for role-based permissions in Meteor is [`alanning:roles`](https://atmospherejs.com/alanning/roles). For example, here is how you would make a user into an administrator, or a moderator:

```js
// Give Alice the 'admin' role
await Roles.addUsersToRolesAsync(aliceUserId, 'admin', Roles.GLOBAL_GROUP);

// Give Bob the 'moderator' role for a particular category
await Roles.addUsersToRolesAsync(bobsUserId, 'moderator', categoryId);
```

Now, let's say you wanted to check if someone was allowed to delete a particular forum post:

```js
const forumPost = await Posts.findOneAsync(postId);

const canDelete = await Roles.userIsInRoleAsync(
  userId,
  ['admin', 'moderator'],
  forumPost.categoryId
);

if (!canDelete) {
  throw new Meteor.Error('unauthorized',
    'Only admins and moderators can delete posts.');
}

await Posts.removeAsync(postId);
```

Note that we can check for multiple roles at once, and if someone has a role in the `GLOBAL_GROUP`, they are considered as having that role in every group.

Read more in the [`alanning:roles` package documentation](https://atmospherejs.com/alanning/roles).

### Per-document permissions

Sometimes, it doesn't make sense to abstract permissions into "groups" - you want documents to have owners and that's it. In this case, you can use a simpler strategy using collection helpers:

```js
Lists.helpers({
  editableBy(userId) {
    if (!this.userId) {
      return false;
    }
    return this.userId === userId;
  }
});
```

Now, we can call this simple function to determine if a particular user is allowed to edit this list:

```js
const list = await Lists.findOneAsync(listId);

if (!list.editableBy(userId)) {
  throw new Meteor.Error('unauthorized',
    'Only list owners can edit private lists.');
}
```

Learn more about how to use collection helpers in the [Collections article](/tutorials/collections/collections#collection-helpers).

## Best practices summary

1. **Use accounts-password** for email/password login and add OAuth packages as needed.
2. **Validate new users** with `Accounts.validateNewUser` to ensure required fields.
3. **Use case-insensitive queries** with `Accounts.findUserByEmail` and `Accounts.findUserByUsername`.
4. **Customize email templates** using `Accounts.emailTemplates` for professional communications.
5. **Never use the profile field** for sensitive data—deny client-side writes to user documents.
6. **Add custom data to top-level fields** on user documents, not nested in profile.
7. **Always filter fields** when publishing user data to clients.
8. **Use alanning:roles** for role-based access control.
9. **Use collection helpers** for per-document permissions.
10. **Configure defaultFieldSelector** to optimize user document fetching.
