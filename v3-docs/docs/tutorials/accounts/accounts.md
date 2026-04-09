# Users and Accounts

After reading this article, you'll know:

1. What features in core Meteor enable user accounts
2. How to build a fully-featured password login experience
3. How to set up passwordless login
4. How to add two-factor authentication (2FA)
5. How to enable login through OAuth providers like Facebook
6. How to add custom data to Meteor's users collection
7. How to protect your data with per-document permissions

## Features in core Meteor

Before we get into all of the different user-facing accounts functionality you can add with Meteor, let's go over some of the features built into the Meteor DDP protocol and `accounts-base` package. These are the parts of Meteor that you'll definitely need to be aware of if you have any user accounts in your app; most of everything else is optional and added/removed via packages.

### userId in DDP

DDP is Meteor's built-in pub/sub and RPC protocol. You can read about how to use it in the [Data Loading](/tutorials/data-loading/data-loading) and [Methods](/tutorials/methods/methods) articles. In addition to the concepts of data loading and method calls, DDP has one more feature built in - the idea of a `userId` field on a connection. This is the place where login state is tracked, regardless of which accounts UI package or login service you are using.

This built-in feature means that you always get `this.userId` inside Methods and Publications, and can access the user ID on the client. This is a great starting point for building your own custom accounts system, but most developers won't need to worry about the mechanics, since you'll mostly be interacting with the `accounts-base` package instead.

### accounts-base

This package is the core of Meteor's developer-facing user accounts functionality. This includes:

1. A users collection with a standard schema, accessed through [`Meteor.users`](/api/accounts#Meteor-users), and the client-side singletons [`Meteor.userId()`](/api/accounts#Meteor-userId), [`Meteor.user()`](/api/accounts#Meteor-user), and the async [`Meteor.userAsync()`](/api/accounts#Meteor-userAsync), which represent the login state on the client.
2. Reactive helpers [`Accounts.loggingIn()`](/api/accounts#Accounts-loggingIn) and [`Accounts.loggingOut()`](/api/accounts#Accounts-loggingOut) to track in-progress login/logout state.
3. A variety of helpful other generic methods to keep track of login state, log out, validate users, etc. Visit the [Accounts section of the docs](/api/accounts) to find a complete list.
4. An API for registering new login handlers, which is used by all of the other accounts packages to integrate with the accounts system.

Usually, you don't need to include `accounts-base` yourself since it's added for you if you use `accounts-password` or similar, but it's good to be aware of what is what.

## Password login

Meteor comes with a secure and fully-featured password login system out of the box. To use it, add the package:

```bash
meteor add accounts-password
```

### Requiring username or email

By default, the `Accounts.createUserAsync` function provided by `accounts-password` allows you to create an account with a username, email, or both. Most apps expect a specific combination of the two, so you will certainly want to validate the new user creation:

```js
// Ensuring every user has an email address, should be in server-side code
Accounts.validateNewUser((user) => {
  new SimpleSchema({
    _id: { type: String },
    emails: { type: Array },
    "emails.$": { type: Object },
    "emails.$.address": { type: String },
    "emails.$.verified": { type: Boolean },
    createdAt: { type: Date },
    services: { type: Object, blackbox: true },
  }).validate(user);

  // Return true to allow user creation to proceed
  return true;
});
```

> When creating users programmatically, prefer the async variant:

```js
// Client or server
const userId = await Accounts.createUserAsync({
  username: "ada",
  email: "ada@lovelace.com",
  password: "secret",
  profile: { name: "Ada Lovelace" },
});
```

If you want to automatically send an email verification after account creation, use `Accounts.createUserVerifyingEmail` instead:

```js
await Accounts.createUserVerifyingEmail({
  email: "ada@lovelace.com",
  password: "secret",
});
```

### Managing multiple email addresses

Users can associate more than one email address with their account. Meteor stores them as an array in the user document, so you can add, remove, and verify each one independently.

```js
// Add a new address for the user (server)
await Accounts.addEmailAsync(userId, "work@example.com");

// Remove an address (server)
await Accounts.removeEmail(userId, "old@example.com");

// Send a verification email to a specific address (server)
await Accounts.sendVerificationEmail(userId, "work@example.com");
```

A common pattern is to record a "primary" email address — the one used for notifications and password resets — as a top-level field on the user document:

```js
await Meteor.users.updateAsync(userId, {
  $set: { primaryEmail: "work@example.com" },
});
```

### Case sensitivity

Meteor handles case sensitivity for email addresses and usernames. Since MongoDB doesn't have a concept of case-insensitive indexes, it was impossible to guarantee unique emails at the database level. For this reason, we have some special APIs for querying and updating users which manage the case-sensitivity problem at the application level.

**What does this mean for your app?**

Follow one rule: don't query the database by `username` or `email` directly. Instead, use the [`Accounts.findUserByUsername`](/api/accounts#Accounts-findUserByUsername) and [`Accounts.findUserByEmail`](/api/accounts#Accounts-findUserByEmail) methods provided by Meteor. This will run a query for you that is case-insensitive, so you will always find the user you are looking for.

### Security configuration

`Accounts.config()` exposes several options that harden your login system. Call it once from server-side startup code.

**Prevent user enumeration.** When enabled (the default in Meteor 3), "user not found" and "incorrect password" return the same error message to the caller, making it impossible for an attacker to discover which email addresses are registered:

```js
Accounts.config({ ambiguousErrorMessages: true }); // default: true
```

**Block client-side account creation.** Ensure new accounts can only be created server-side (e.g. through a trusted Meteor Method), preventing unvetted signups from the browser console:

```js
Accounts.config({ forbidClientAccountCreation: true });
```

**Restrict signups by email domain.** Accept a string, an array of strings, or a function:

```js
// single domain
Accounts.config({ restrictCreationByEmailDomain: "mycompany.com" });

// multiple domains
Accounts.config({
  restrictCreationByEmailDomain: ["mycompany.com", "contractor.io"],
});

// custom logic
Accounts.config({
  restrictCreationByEmailDomain: (email) => email.endsWith(".edu"),
});
```

**Credential storage.** By default, login tokens are stored in `localStorage` and survive across browser sessions. Set `clientStorage` to `'session'` to clear credentials when the browser tab is closed:

```js
Accounts.config({ clientStorage: "session" }); // 'local' (default) or 'session'
```

### Password hashing

Meteor uses **bcrypt** to hash passwords by default. You can tune the work factor:

```js
Accounts.config({ bcryptRounds: 12 }); // default: 10
```

Meteor 3.x also supports **Argon2**, which is recommended by [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) for new applications:

```js
// server-side startup code
Accounts.config({
  argon2Enabled: true,
  argon2Type: "argon2id", // 'argon2i' | 'argon2d' | 'argon2id' (default)
  argon2TimeCost: 2, // iterations (default: 2)
  argon2MemoryCost: 19456, // memory in KiB — 19 MB (default)
  argon2Parallelism: 1, // threads (default: 1)
});
```

Enabling Argon2 does not break existing users. Existing bcrypt hashes continue to work and are transparently re-hashed to Argon2 the next time each user logs in.

### Token lifetime configuration

You can control how long session and email tokens remain valid:

```js
Accounts.config({
  loginExpirationInDays: 90, // session token lifetime (default: 90; set to null to never expire)
  passwordResetTokenExpirationInDays: 3, // password reset link lifetime (default: 3 days)
  passwordEnrollTokenExpirationInDays: 30, // account enrollment link lifetime (default: 30 days)
});
```

### Email flows

When you have a login system for your app based on user emails, that opens up the possibility for email-based account flows. The common thing between all of these workflows is that they involve sending a unique link to the user's email address, which does something special when it is clicked. Let's look at some common examples that Meteor's `accounts-password` package supports out of the box:

1. **Password reset.** When the user clicks the link in their email, they are taken to a page where they can enter a new password for their account.
2. **User enrollment.** A new user is created by an administrator, but no password is set. When the user clicks the link in their email, they are taken to a page where they can set a new password for their account.
3. **Email verification.** When the user clicks the link in their email, the application records that this email does indeed belong to the correct user.

#### Sending the email

`accounts-password` comes with handy functions that you can call from the server to send an email:

1. [`Accounts.sendResetPasswordEmail(userId, email?, extraTokenData?, extraParams?)`](/api/accounts#Accounts-sendResetPasswordEmail)
2. [`Accounts.sendEnrollmentEmail(userId, email?, extraTokenData?, extraParams?)`](/api/accounts#Accounts-sendEnrollmentEmail)
3. [`Accounts.sendVerificationEmail(userId, email?, extraTokenData?, extraParams?)`](/api/accounts#Accounts-sendVerificationEmail)

The optional `extraTokenData` object is merged into the token stored in the database and is available inside email templates. The optional `extraParams` object is appended to the generated URL as query parameters.

If you need to generate a token without sending an email (for example, to build a custom mailer), use the lower-level helpers:

```js
// Generate a password reset token (server)
const { token } = await Accounts.generateResetToken(
  userId,
  email,
  "resetPassword"
);

// Generate an email verification token (server)
const { token } = await Accounts.generateVerificationToken(userId, email);
```

The email is generated using the email templates from [`Accounts.emailTemplates`](/api/accounts#Accounts-emailTemplates), and includes links generated with `Accounts.urls`.

#### Handling the link in your app

When the user clicks the link in their email, their browser navigates to your app with the token embedded in the URL. Register a client-side callback to detect each flow and render the appropriate UI — there is one for each link type: `Accounts.onResetPasswordLink`, `Accounts.onEnrollmentLink`, and `Accounts.onEmailVerificationLink`. Here's how you would implement the password reset flow:

```js
Accounts.onResetPasswordLink(async (token, done) => {
  // Display the password reset UI, get the new password...

  try {
    await new Promise((resolve, reject) =>
      Accounts.resetPassword(token, newPassword, (err) =>
        err ? reject(err) : resolve()
      )
    );
    // Resume normal operation
    done();
  } catch (err) {
    // Display error
    console.error("Password reset failed:", err);
  }
});
```

If you want a different URL for your reset password page, you need to customize it using the `Accounts.urls` option. URL generators can also be `async` or return a `Promise`:

```js
Accounts.urls.resetPassword = (token) => {
  return Meteor.absoluteUrl(`reset-password/${token}`);
};
```

If you have customized the URL, you will need to add a new route to your router that handles the URL you have specified.

#### Completing the process

When the user submits the form, you need to call the appropriate function to commit their change to the database. Both functions are callback-based; wrap them in a `Promise` to use with `async/await`:

1. [`Accounts.resetPassword(token, newPassword, callback)`](/api/accounts#Accounts-resetPassword) — use this both for resetting the password and enrolling a new user; it accepts both kinds of tokens. Logs in the user after a successful reset (unless 2FA is enabled — see [Two-Factor Authentication](#two-factor-authentication-accounts-2fa)).
2. [`Accounts.verifyEmail(token, callback)`](/api/accounts#Accounts-verifyEmail) — logs in the user after a successful verification (unless 2FA is enabled).

After you have called one of the two functions above or the user has cancelled the process, call the `done` function you got in the link callback.

### Customizing accounts emails

You will probably want to customize the emails `accounts-password` will send on your behalf. This can be done through the [`Accounts.emailTemplates` API](/api/accounts#Accounts-emailTemplates). Below is some example code:

```js
Accounts.emailTemplates.siteName = "Meteor Guide Todos Example";
Accounts.emailTemplates.from = "Meteor Todos Accounts <accounts@example.com>";

Accounts.emailTemplates.resetPassword = {
  subject(user, url) {
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
  },
};
```

#### HTML emails

If you've ever needed to deal with sending pretty HTML emails from an app, you know that it can quickly become a nightmare. Compatibility of popular email clients with basic HTML features like CSS is notoriously spotty. Start with a [responsive email template](https://github.com/leemunroe/responsive-html-email-template) or [framework](https://get.foundation/emails), and then use a tool to convert your email content into something that is compatible with all email clients.

## Passwordless login

The `accounts-passwordless` package provides a one-time token (magic link) login experience — no password required.

```bash
meteor add accounts-passwordless
```

### Requesting a login token

On the client, call `Accounts.requestLoginTokenForUser` to send a one-time token to the user's email address:

```js
// Client
await Accounts.requestLoginTokenForUser({
  selector: { email: "ada@lovelace.com" },
  // options.userCreationDisabled: true prevents creating a new account
  // if no existing user matches the selector
  options: {},
});
```

If no account exists for the given selector and `userCreationDisabled` is not set, you can pass `userData` to create the account on the fly:

```js
await Accounts.requestLoginTokenForUser({
  selector: { email: "ada@lovelace.com" },
  userData: { email: "ada@lovelace.com", profile: { name: "Ada Lovelace" } },
});
```

### Logging in with the token

When the user clicks the link in their email (or copies the token), call:

```js
// Client
await new Promise((resolve, reject) =>
  Meteor.passwordlessLoginWithToken(
    { email: "ada@lovelace.com" },
    token,
    (err) => (err ? reject(err) : resolve())
  )
);
```

If the user has [Two-Factor Authentication](#two-factor-authentication-accounts-2fa) enabled, use the 2FA variant instead:

```js
await new Promise((resolve, reject) =>
  Meteor.passwordlessLoginWithTokenAnd2faCode(
    { email: "ada@lovelace.com" },
    token,
    totpCode,
    (err) => (err ? reject(err) : resolve())
  )
);
```

### Automatic URL-based login

The `accounts-passwordless` package automatically detects when the URL contains a `loginToken` query parameter (e.g. from an email link) and logs the user in. This is handled by `Accounts.autoLoginWithToken()`, which the package calls internally on startup — **you do not need to call it yourself**.

If you need to trigger the check manually (for example, after programmatically updating the URL), you can call it directly:

```js
Accounts.autoLoginWithToken();
```

### Customizing the email

Customize the token email through `Accounts.emailTemplates.sendLoginToken`:

```js
Accounts.emailTemplates.sendLoginToken = {
  subject(user) {
    return "Your login link";
  },
  text(user, url) {
    return `Click the link below to log in:\n\n${url}\n\nThis link expires in 15 minutes.`;
  },
};
```

## Two-Factor Authentication

The `accounts-2fa` package adds Time-based One-Time Password (TOTP) two-factor authentication, compatible with any standard authenticator app (Google Authenticator, Authy, etc.).

```bash
meteor add accounts-2fa
```

### Enabling 2FA for a user

The setup flow happens on the client:

```js
// Step 1: generate a QR code and display it to the user
const { svg, secret, uri } = await new Promise((resolve, reject) =>
  Accounts.generate2faActivationQrCode("My App", (err, result) => {
    if (err) reject(err);
    else resolve(result);
  })
);
// Render `svg` in your UI so the user can scan it with their authenticator app

// Step 2: once the user has scanned the QR code and sees the first code, confirm it
await new Promise((resolve, reject) =>
  Accounts.enableUser2fa(totpCode, (err) => {
    if (err) reject(err);
    else resolve();
  })
);
```

### Disabling 2FA and checking status

```js
// Check if the current user has 2FA enabled
const enabled = await new Promise((resolve, reject) =>
  Accounts.has2faEnabled((err, result) => {
    if (err) reject(err);
    else resolve(result);
  })
);

// Disable 2FA for the current user
await new Promise((resolve, reject) =>
  Accounts.disableUser2fa((err) => {
    if (err) reject(err);
    else resolve();
  })
);
```

### Logging in with 2FA

When a user has 2FA enabled, the standard `Meteor.loginWithPassword` call will fail with an error prompting for a code. Use the dedicated method instead:

```js
try {
  await new Promise((resolve, reject) =>
    Meteor.loginWithPasswordAnd2faCode(
      "ada@lovelace.com",
      "mypassword",
      totpCode,
      (err) => (err ? reject(err) : resolve())
    )
  );
} catch (err) {
  console.error("Login failed:", err);
}
```

### Effect on password reset and email verification

When 2FA is enabled, completing a password reset (`Accounts.resetPassword`) or email verification (`Accounts.verifyEmail`) will **not** automatically log the user in. The user must perform a full login (including the 2FA step) manually afterward.

### Configuration

```js
Accounts.config({
  loginTokenExpirationHours: 1, // how long a TOTP window stays valid (default: 1 hour)
  tokenSequenceLength: 6, // TOTP code length (default: 6)
});
```

## OAuth login

Meteor supports popular login providers through OAuth out of the box.

### Adding an OAuth provider

Meteor maintains packages for popular login providers. Add one or more to your app:

```bash
meteor add accounts-facebook    # Facebook
meteor add accounts-google      # Google
meteor add accounts-github      # GitHub
meteor add accounts-twitter     # Twitter
meteor add accounts-meetup      # Meetup
meteor add accounts-meteor-developer  # Meteor Developer Accounts
```

Each package adds a `Meteor.loginWith<Service>` function and registers the service in the OAuth configuration UI.

### Logging in programmatically

You can log in with any configured OAuth provider using the `Meteor.loginWith<Service>` function:

```js
try {
  await Meteor.loginWithFacebook({
    requestPermissions: ["user_friends", "public_profile", "email"],
  });
  // successful login!
} catch (err) {
  // handle error
  console.error("Login failed:", err);
}
```

### Configuring OAuth

There are a few points to know about configuring OAuth login:

1. **Client ID and secret.** It's best to keep your OAuth secret keys outside of your source code, and pass them in through Meteor.settings. Read how in the [Security article](/tutorials/security/security#api-keys).
2. **Redirect URL.** On the OAuth provider's side, you'll need to specify a _redirect URL_. The URL will look like: `https://www.example.com/_oauth/facebook`. Replace `facebook` with the name of the service you are using. Note that you will need to configure two URLs - one for your production app, and one for your development environment, where the URL might be something like `http://localhost:3000/_oauth/facebook`.
3. **Permissions.** Each login service provider should have documentation about which permissions are available. If you want additional permissions to the user's data when they log in, pass some of these strings in the `requestPermissions` option.

### Server-side hooks for OAuth

You can customize how OAuth accounts are created and updated on the server using these hooks. Each can only be registered once:

```js
// Called before processing an external login. Return false to block the login.
Accounts.beforeExternalLogin((serviceName, serviceData, user) => {
  // e.g. only allow logins from a specific GitHub org
  if (serviceName === "github" && !serviceData.orgs?.includes("my-org")) {
    return false;
  }
  return true;
});

// Provide additional lookup logic to find an existing user for an external login.
// Useful for linking accounts when the external service email matches an existing user.
Accounts.setAdditionalFindUserOnExternalLogin(
  ({ serviceName, serviceData }) => {
    if (serviceData.email) {
      return Accounts.findUserByEmail(serviceData.email);
    }
  }
);

// Called on every external login to update the user document.
// Return a modified user object to apply changes.
Accounts.onExternalLogin((options, user) => {
  // Merge the latest profile data from the OAuth provider
  user.profile = user.profile || {};
  user.profile.name = options.serviceData.name;
  return user;
});
```

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
Meteor.publish("lists.private", function () {
  if (!this.userId) {
    return this.ready();
  }

  return Lists.find(
    {
      userId: this.userId,
    },
    {
      fields: Lists.publicFields,
    }
  );
});
```

```js
// Accessing this.userId inside a Method
Meteor.methods({
  async "todos.updateText"({ todoId, newText }) {
    new SimpleSchema({
      todoId: { type: String },
      newText: { type: String },
    }).validate({ todoId, newText });

    const todo = await Todos.findOneAsync(todoId);

    if (!todo.editableBy(this.userId)) {
      throw new Meteor.Error(
        "todos.updateText.unauthorized",
        "Cannot edit todos in a private list that is not yours"
      );
    }

    await Todos.updateAsync(todoId, {
      $set: { text: newText },
    });
  },
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
  addressCountry: "US",
  addressLocality: "Seattle",
  addressRegion: "WA",
  postalCode: "98052",
  streetAddress: "20341 Whitworth Institute 405 N. Whitworth",
};

await Meteor.users.updateAsync(userId, {
  $set: {
    mailingAddress: newMailingAddress,
  },
});
```

You can use any field name other than those [used by the Accounts system](/api/accounts#Meteor-users).

### Adding fields on user registration

Sometimes, you want to set a field when the user first creates their account. You can do this using [`Accounts.onCreateUser`](/api/accounts#Accounts-onCreateUser):

```js
// Generate user initials after Facebook login
Accounts.onCreateUser((options, user) => {
  if (!user.services.facebook) {
    throw new Error("Expected login with Facebook only.");
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
import { Random } from "meteor/random";

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
  update() {
    return true;
  },
});
```

### Publishing custom data

If you want to access the custom data you've added to the `Meteor.users` collection in your UI, you'll need to publish it to the client. The most important thing to keep in mind is that user documents contain private data about your users—hashed passwords and access keys for external APIs. This means it's critically important to filter the fields of the user document that you send to any client.

```js
Meteor.publish("Meteor.users.initials", function ({ userIds }) {
  // Validate the arguments to be what we expect
  new SimpleSchema({
    userIds: { type: Array },
    "userIds.$": { type: String },
  }).validate({ userIds });

  // Select only the users that match the array of IDs passed in
  const selector = {
    _id: { $in: userIds },
  };

  // Only return one field, `initials`
  const options = {
    fields: { initials: 1 },
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
const userExists = !!(await Accounts.findUserByEmail(email, {
  fields: { _id: 1 },
}));

// get the user id from a userName:
const user = await Accounts.findUserByUsername(userName, {
  fields: { _id: 1 },
});
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
  },
});
```

Or omit fields with large amounts of data:

```js
Accounts.config({ defaultFieldSelector: { myBigArray: 0 } });
```

## Roles and permissions

Once users are logged in, you'll often want to control what each user can do. This uncovers two different types of permissions:

1. Role-based permissions
2. Per-document permissions

### roles

Meteor ships a core [`roles`](/packages/roles) package for role-based permissions. Add it to your app:

```bash
meteor add roles
```

Here is how you would make a user into an administrator, or a moderator:

```js
// Give Alice the 'admin' role
await Roles.addUsersToRolesAsync(aliceUserId, "admin", Roles.GLOBAL_GROUP);

// Give Bob the 'moderator' role for a particular category
await Roles.addUsersToRolesAsync(bobsUserId, "moderator", categoryId);
```

Now, let's say you wanted to check if someone was allowed to delete a particular forum post:

```js
const forumPost = await Posts.findOneAsync(postId);

const canDelete = await Roles.userIsInRoleAsync(
  userId,
  ["admin", "moderator"],
  forumPost.categoryId
);

if (!canDelete) {
  throw new Meteor.Error(
    "unauthorized",
    "Only admins and moderators can delete posts."
  );
}

await Posts.removeAsync(postId);
```

Note that you can check for multiple roles at once, and if someone has a role in `GLOBAL_GROUP`, they are considered as having that role in every group.

### Per-document permissions

Sometimes, it doesn't make sense to abstract permissions into "groups" - you want documents to have owners and that's it. In this case, you can use a simpler strategy using collection helpers:

```js
Lists.helpers({
  editableBy(userId) {
    if (!this.userId) {
      return false;
    }
    return this.userId === userId;
  },
});
```

Now, we can call this simple function to determine if a particular user is allowed to edit this list:

```js
const list = await Lists.findOneAsync(listId);

if (!list.editableBy(userId)) {
  throw new Meteor.Error(
    "unauthorized",
    "Only list owners can edit private lists."
  );
}
```

Learn more about how to use collection helpers in the [Collections article](/tutorials/collections/collections#collection-helpers).

## Best practices summary

1. **Use accounts-password** for email/password login and add OAuth packages as needed.
2. **Validate new users** with `Accounts.validateNewUser` to ensure required fields are present.
3. **Use `Accounts.createUserAsync`** (or `Accounts.createUserVerifyingEmail`) instead of the callback-based `createUser`.
4. **Use case-insensitive queries** with `Accounts.findUserByEmail` and `Accounts.findUserByUsername` — never query `Meteor.users` directly by email or username.
5. **Enable `ambiguousErrorMessages: true`** (the default) to prevent user enumeration attacks.
6. **Customize email templates** using `Accounts.emailTemplates` for professional-looking communications.
7. **Never use the profile field** for sensitive data — deny client-side writes with `Meteor.users.deny({ update() { return true; } })`.
8. **Add custom data to top-level fields** on user documents, not nested inside `profile`.
9. **Always filter fields** when publishing user data to clients — never expose password hashes or access tokens.
10. **Consider Argon2** for new applications by enabling `argon2Enabled: true` in `Accounts.config()`.
11. **Add 2FA** with `accounts-2fa` for applications with elevated security requirements.
12. **Use `accounts-passwordless`** to offer a frictionless, password-free login experience.
13. **Configure `defaultFieldSelector`** to avoid loading large user documents on every login.
