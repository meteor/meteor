# Accounts

## Accounts-base {#accounts-base}

The Meteor Accounts system builds on top of the `userId` support in
[`publish`](./meteor#Subscription-userId) and [`methods`](./meteor#methods-userId). The core
packages add the concept of user documents stored in the database, and
additional packages add [secure password authentication](#passwords),
[integration with third party login services](#Meteor-loginWith%3CExternalService%3E),
and a [pre-built userinterface](/packages/accounts-ui.html).

The basic Accounts system is in the `accounts-base` package, but
applications typically include this automatically by adding one of the
login provider packages: `accounts-password`, `accounts-facebook`,
`accounts-github`, `accounts-google`, `accounts-meetup`,
`accounts-twitter`, or `accounts-weibo`.

Read more about customizing user accounts in the [Accounts](http://guide.meteor.com/accounts.html) article in the Meteor Guide.

### Accounts with Session Storage {# accounts-session-storage}

By default, Meteor uses Local Storage to store, among other things, login tokens in your browser session. But, for some applications, it makes sense to use Session Storage instead. You can achieve this by adding this to your settings:

```json
{
  // ... all other settings,
  "public": {
    // ... all your public settings
    "packages": {
      "accounts": {
        "clientStorage": "session"
      }
    }
  }
}
```

<ApiBox name="Meteor.user" hasCustomExample/>

Retrieves the user record for the current user from
the [`Meteor.users`](#Meteor-users) collection.

On the client, the available fields will be those that
are published from the server (other fields won't be available on the
client). By default the server publishes `username`, `emails`, and
`profile` (writable by user). See [`Meteor.users`](#Meteor-users) for more on
the fields used in user documents.

On the server, this will fetch the record from the database. To improve the
latency of a method that uses the user document multiple times, save the
returned record to a variable instead of re-calling `Meteor.user()`.

Fetching the full user document can cause unnecessary database usage on the
server and over-reactivity on the client, particularly if you store lots of
custom data on it. Therefore it is recommended to use the `options`
parameter to only fetch the fields you need:

```js
import { Meteor } from "meteor/meteor";
const userName = Meteor.user({ fields: { "profile.name": 1 } }).profile.name;
```

<ApiBox name="Meteor.userAsync" hasCustomExample/>

Same as [`Meteor.user`](#Meteor-user), but returns a promise and is available on the server.

```js
import { Meteor } from "meteor/meteor";
const user = await Meteor.userAsync();
```

<ApiBox name="Meteor.userId" />

<ApiBox name="Meteor.users" />

This collection contains one document per registered user. Here's an example
user document:

```js
{
  _id: 'QwkSmTCZiw5KDx3L6',  // Meteor.userId()
  username: 'cool_kid_13', // Unique name
  emails: [
    // Each email address can only belong to one user.
    { address: 'cool@example.com', verified: true },
    { address: 'another@different.com', verified: false }
  ],
  createdAt: new Date('Wed Aug 21 2013 15:16:52 GMT-0700 (PDT)'),
  profile: {
    // The profile is writable by the user by default.
    name: 'Joe Schmoe'
  },
  services: {
    facebook: {
      id: '709050', // Facebook ID
      accessToken: 'AAACCgdX7G2...AbV9AZDZD'
    },
    resume: {
      loginTokens: [
        { token: '97e8c205-c7e4-47c9-9bea-8e2ccc0694cd',
          when: 1349761684048 }
      ]
    }
  }
}
```

A user document can contain any data you want to store about a user. Meteor
treats the following fields specially:

- `username`: a unique String identifying the user.
- `emails`: an Array of Objects with keys `address` and `verified`;
  an email address may belong to at most one user. `verified` is
  a Boolean which is true if the user has [verified the address](#Accounts-verifyEmail) with a token sent over email.
- `createdAt`: the Date at which the user document was created.
- `profile`: an Object which the user can create and update with any data.
  Do not store anything on `profile` that you wouldn't want the user to edit
  unless you have a deny rule on the `Meteor.users` collection.
- `services`: an Object containing data used by particular
  login services. For example, its `reset` field contains
  tokens used by [forgot password](#Accounts-forgotPassword) links,
  and its `resume` field contains tokens used to keep you
  logged in between sessions.

Like all [Mongo.Collection](./collections.md)s, you can access all
documents on the server, but only those specifically published by the server are
available on the client. You can also use all Collection methods, for instance
`Meteor.users.remove` on the server to delete a user.

By default, the current user's `username`, `emails` and `profile` are
published to the client. You can publish additional fields for the
current user with:

::: code-group

```js [server.js]
Meteor.publish("userData", function () {
  if (this.userId) {
    return Meteor.users.find(
      { _id: this.userId },
      {
        fields: { other: 1, things: 1 },
      }
    );
  } else {
    this.ready();
  }
});
```

```js [client.js]
Meteor.subscribe("userData");
```

:::
If the autopublish package is installed, information about all users
on the system is published to all clients. This includes `username`,
`profile`, and any fields in `services` that are meant to be public
(eg `services.facebook.id`,
`services.twitter.screenName`). Additionally, when using autopublish
more information is published for the currently logged in user,
including access tokens. This allows making API calls directly from
the client for services that allow this.

Users are by default allowed to specify their own `profile` field with
[`Accounts.createUser`](#Accounts-createUser) and modify it with
`Meteor.users.update`. To allow users to edit additional fields, use
[`Meteor.users.allow`](./collections.md#Mongo-Collection-allow). To forbid users from making any modifications to
their user document:

```js
import { Meteor } from "meteor/meteor";
Meteor.users.deny({ update: () => true });
```

<ApiBox name="Meteor.loggingIn" />

For example, [the `accounts-ui` package](../packages/accounts-ui.md) uses this to display an
animation while the login request is being processed.

<ApiBox name="Meteor.loggingOut" />

<ApiBox name="Meteor.logout" />

<ApiBox name="Meteor.logoutOtherClients" />

For example, when called in a user's browser, connections in that browser
remain logged in, but any other browsers or DDP clients logged in as that user
will be logged out.

<ApiBox name="Meteor.loginWithPassword" />

If there are multiple users with a username or email only differing in case, a case sensitive match is required. Although `createUser` won't let you create users with ambiguous usernames or emails, this could happen with existing databases or if you modify the users collection directly.

This method can fail throwing one of the following errors:

- "Unrecognized options for login request [400]" if `user` or `password` is undefined.
- "Match failed [400]" if `user` isn't an Object or String, or `password` isn't a String.
- "User not found [403]" if the email or username provided in `user` doesn't belong to a registered user.
- "Incorrect password [403]" if the password provided is incorrect.
- "User has no password set [403]" if `user` doesn't have a password.

This function is provided by the `accounts-password` package. See the
[Passwords](#passwords) section below.

<ApiBox name="Meteor.loginWith<ExternalService>" />

Available functions are:

- `Meteor.loginWithMeteorDeveloperAccount`
- `Meteor.loginWithFacebook`
  - `options` may also include [Facebook's `auth_type` parameter](https://developers.facebook.com/docs/facebook-login/manually-build-a-login-flow#reaskperms)
- `Meteor.loginWithGithub`
- `Meteor.loginWithGoogle`
  - `options` may also include [Google's additional URI parameters](https://developers.google.com/identity/protocols/OpenIDConnect#authenticationuriparameters)
- `Meteor.loginWithMeetup`
- `Meteor.loginWithTwitter`
  - `options` may also include [Twitter's `force_login` parameter](https://dev.twitter.com/oauth/reference/get/oauth/authenticate)
- `Meteor.loginWithWeibo`

These functions initiate the login process with an external
service (eg: Facebook, Google, etc), using OAuth. When called they open a new pop-up
window that loads the provider's login page. Once the user has logged in
with the provider, the pop-up window is closed and the Meteor client
logs in to the Meteor server with the information provided by the external
service.

<h3 id="requestpermissions" name="requestpermissions">Requesting Permissions</h3>

In addition to identifying the user to your application, some services
have APIs that allow you to take action on behalf of the user. To
request specific permissions from the user, pass the
`requestPermissions` option the login function. This will cause the user
to be presented with an additional page in the pop-up dialog to permit
access to their data. The user's `accessToken` &mdash; with permissions
to access the service's API &mdash; is stored in the `services` field of
the user document. The supported values for `requestPermissions` differ
for each login service and are documented on their respective developer
sites:

- Facebook: <http://developers.facebook.com/docs/authentication/permissions/>
- GitHub: <http://developer.github.com/v3/oauth/#scopes>
- Google: <https://developers.google.com/identity/protocols/googlescopes>
- Meetup: <http://www.meetup.com/meetup_api/auth/#oauth2-scopes>
- Twitter, Weibo, Meteor developer accounts: `requestPermissions` currently not supported

External login services typically require registering and configuring
your application before use. The easiest way to do this is with the
[`accounts-ui` package](../packages/accounts-ui.md) which presents a step-by-step guide
to configuring each service. However, the data can be also be entered
manually in the `ServiceConfiguration.configurations` collection, which
is exported by the `service-configuration` package.

## Configuring Services {#service-configuration}

First, add the service configuration package:

```bash
meteor add service-configuration
```

Then, inside the server of your app (this example is for the Weebo service), import `ServiceConfiguration`:

```js
import { ServiceConfiguration } from "meteor/service-configuration";
ServiceConfiguration.configurations.upsert(
  { service: "weibo" },
  {
    $set: {
      loginStyle: "popup",
      clientId: "1292962797", // See table below for correct property name!
      secret: "75a730b58f5691de5522789070c319bc",
    },
  }
);
```

Since Meteor 2.7 you no longer need to manually set the configuration and instead can use Meteor settings by setting your services under `Meteor.settings.packages.service-configuration.<service>`. All the properties can be set under the service and will be added to the database as is, so make sure that they are correct. For the example above, the settings would look like:

```json
{
  "packages": {
    "service-configuration": {
      "weibo": {
        "loginStyle": "popup",
        "clientId": "1292962797",
        "secret": "75a730b58f5691de5522789070c319bc"
      }
    }
  }
}
```

The correct property name to use for the API identifier (i.e. `clientId` in the above example) depends on the login service being used, so be sure to use the correct one:

| Property Name | Services                                                 |
| ------------- | -------------------------------------------------------- |
| `appId`       | Facebook                                                 |
| `clientId`    | Github, Google, Meetup, Meteor Developer Accounts, Weibo |
| `consumerKey` | Twitter                                                  |

Additionally, each external service has its own login provider package and login function. For
example, to support GitHub login, run the following in your terminal:

```bash
meteor add accounts-github
```

and use the `Meteor.loginWithGithub` function:

```js
import { Meteor } from "meteor/meteor";
Meteor.loginWithGithub(
  {
    requestPermissions: ["user", "public_repo"],
  },
  (error) => {
    if (error) {
      Session.set("errorMessage", error.reason || "Unknown error");
    }
  }
);
```

Login service configuration is sent from the server to the client over DDP when
your app starts up; you may not call the login function until the configuration
is loaded. The function `Accounts.loginServicesConfigured()` is a reactive data
source that will return true once the login service is configured; you should
not make login buttons visible or active until it is true.

Ensure that your [`$ROOT_URL`](./meteor.md#Meteor-absoluteUrl) matches the authorized
domain and callback URL that you configure with the external service (for
instance, if you are running Meteor behind a proxy server, `$ROOT_URL` should be
the externally-accessible URL, not the URL inside your proxy).

## Manual service configuration {#manual-service-configuration}

You can use `Accounts.loginServiceConfiguration` to view and edit the settings collection:

```js
import { Accounts } from "meteor/accounts-base";
Accounts.loginServiceConfiguration.find();
```

## Popup versus redirect flow {#popup-vs-redirect-flow}

When configuring OAuth login with a provider (such as Facebook or Google), Meteor lets you choose a popup- or redirect-based flow. In a popup-based flow, when a user logs in, they will be prompted to login at the provider in a popup window. In a redirect-based flow, the user's whole browser window will be redirected to the login provider, and the window will redirect back to your app when the login is completed.

You can also pick which type of login to do by passing an option to [`Meteor.loginWith<ExternalService>`](#Meteor-loginWith%3CExternalService%3E)

Usually, the popup-based flow is preferable because the user will not have to reload your whole app at the end of the login flow. However, the popup-based flow requires browser features such as `window.close` and `window.opener` that are not available in all mobile environments. In particular, we recommend using `Meteor.loginWith<ExternalService>({ loginStyle: 'redirect' })` in the following environments:

- Inside UIWebViews (when your app is loaded inside a mobile app)
- In Safari on iOS8 (`window.close` is not supported due to a bug)

<ApiBox name="currentUser" />

<ApiBox name="loggingIn" />

<ApiBox name="Accounts.ui.config" hasCustomExample/>

Example:

```js
import { Accounts } from "meteor/accounts-base";

Accounts.ui.config({
  requestPermissions: {
    facebook: ["user_likes"],
    github: ["user", "repo"],
  },
  requestOfflineToken: {
    google: true,
  },
  passwordSignupFields: "USERNAME_AND_OPTIONAL_EMAIL",
});
```

Since Meteor 2.7 you can configure these in your Meteor settings under `Meteor.settings.public.packages.accounts-ui-unstyled`.

## Multi-server {#multi-server}

The `accounts-base` package exports two constructors, called
`AccountsClient` and `AccountsServer`, which are used to create the
`Accounts` object that is available on the client and the server,
respectively.

This predefined `Accounts` object (along with similar convenience methods
of `Meteor`, such as [`Meteor.logout`](#Meteor-logout)) is sufficient to
implement most accounts-related logic in Meteor apps. Nevertheless, these
two constructors can be instantiated more than once, to create multiple
independent connections between different accounts servers and their
clients, in more complicated authentication situations.

<ApiBox name="AccountsCommon"/>

The `AccountsClient` and `AccountsServer` classes share a common
superclass, `AccountsCommon`. Methods defined on
`AccountsCommon.prototype` will be available on both the client and the
server, via the predefined `Accounts` object (most common) or any custom
`accountsClientOrServer` object created using the `AccountsClient` or
`AccountsServer` constructors (less common).

Here are a few of those methods:

<ApiBox name="AccountsCommon#userId" instanceName="accountsCommon"/>

<ApiBox name="AccountsCommon#user" instanceName="accountsCommon"/>

<ApiBox name="AccountsCommon#config" instanceName="accountsCommon"/>

From Meteor 2.5 you can set these in your Meteor settings under `Meteor.settings.packages.accounts-base`. Note that due to the nature of settings file you won't be able to set parameters that require functions.

<ApiBox name="AccountsCommon#onLogin" instanceName="accountsCommon"/>

See description of [AccountsCommon#onLoginFailure](#AccountsCommon-onLoginFailure)
for details.

<ApiBox name="AccountsCommon#onLoginFailure" instanceName="accountsCommon"/>

Either the `onLogin` or the `onLoginFailure` callbacks will be called
for each login attempt. The `onLogin` callbacks are called after the
user has been successfully logged in. The `onLoginFailure` callbacks are
called after a login attempt is denied.

These functions return an object with a single method, `stop`. Calling
`stop()` unregisters the callback.

On the server, the callbacks get a single argument, the same attempt info
object as [`validateLoginAttempt`](#AccountsServer-validateLoginAttempt). On the
client, the callback argument is an object containing a single `error`
property set to the `Error`-object which was received from the failed login
attempt.

<ApiBox name="AccountsCommon#onLogout" instanceName="accountsCommon" hasCustomExample/>

On the server, the `func` callback receives a single argument with the object below. On the
client, no arguments are passed.

```js
import { AccountsCommon } from "meteor/accounts-base";
const options = {
  //...
};
const accountsCommon = new AccountsCommon(options);

accountsCommon.onLogout(({ user, connection, collection }) => {
  console.log(user);
  //        ˆˆˆˆˆˆ The Meteor user object of the user which just logged out
  console.log(connection);
  //        ˆˆˆˆˆˆ The connection object the request came in on. See
  //               `Meteor.onConnection` for details.

  console.log(collection);
  //        ˆˆˆˆˆˆ The `collection` The name of the Mongo.Collection or the
  //               Mongo.Collection object to hold the users.
});
```

<ApiBox name="AccountsClient"/>

At most one of `options.connection` and `options.ddpUrl` should be
provided in any instantiation of `AccountsClient`. If neither is provided,
`Meteor.connection` will be used as the `.connection` property of the
`AccountsClient` instance.

Note that `AccountsClient` is currently available only on the client, due
to its use of browser APIs such as `window.localStorage`. In principle,
though, it might make sense to establish a client connection from one
server to another remote accounts server. Please [let us
know](https://github.com/meteor/meteor/wiki/Contributing-to-Meteor#feature-requests)
if you find yourself needing this server-to-server functionality.

These methods are defined on `AccountsClient.prototype`, and are thus
available only on the client:

<ApiBox name="AccountsClient#loggingIn" instanceName="accountsClient"/>

<ApiBox name="AccountsClient#logout" instanceName="accountsClient"/>

<ApiBox name="AccountsClient#logoutOtherClients" instanceName="accountsClient"/>

<ApiBox name="AccountsServer"/>

These methods are defined on `AccountsServer.prototype`, and are thus
available only on the server:

<ApiBox name="AccountsServer#validateNewUser" instanceName="accountsServer"/>

This can be called multiple times. If any of the functions return `false` or
throw an error, the new user creation is aborted. To set a specific error
message (which will be displayed by [`accounts-ui`](../packages/accounts-ui.md)), throw a new
[`Meteor.Error`](./meteor#meteor-api).

Example:

```js
import { Accounts } from "meteor/accounts-base";

// Validate username, sending a specific error message on failure.
Accounts.validateNewUser((user) => {
  if (user.username && user.username.length >= 3) {
    return true;
  } else {
    throw new Meteor.Error(403, "Username must have at least 3 characters");
  }
});

// Validate username, without a specific error message.
Accounts.validateNewUser((user) => {
  return user.username !== "root";
});
```

If the user is being created as part of a login attempt from a client (eg,
calling [`Accounts.createUser`](#Accounts-createUser) from the client, or
[logging in for the first time with an external
service](#meteor_loginwithexternalservice)), these callbacks are called _before_
the [`Accounts.validateLoginAttempt`](#Accounts-validateLoginAttempt)
callbacks. If these callbacks succeed but those fail, the user will still be
created but the connection will not be logged in as that user.

<ApiBox name="AccountsServer#onCreateUser" instanceName="accountsServer" hasCustomExample/>

Use this when you need to do more than simply accept or reject new user
creation. With this function you can programatically control the
contents of new user documents.

The function you pass will be called with two arguments: `options` and
`user`. The `options` argument comes
from [`Accounts.createUser`](#Accounts-createUser) for
password-based users or from an external service login flow. `options` may come
from an untrusted client so make sure to validate any values you read from
it. The `user` argument is created on the server and contains a
proposed user object with all the automatically generated fields
required for the user to log in, including the `_id`.

The function should return the user document (either the one passed in or a
newly-created object) with whatever modifications are desired. The returned
document is inserted directly into the [`Meteor.users`](#Meteor-users) collection.

The default create user function simply copies `options.profile` into
the new user document. Calling `onCreateUser` overrides the default
hook. This can only be called once.

Example:

```js
import { Accounts } from "meteor/accounts-base";
// Support for playing D&D: Roll 3d6 for dexterity.
Accounts.onCreateUser((options, user) => {
  const customizedUser = Object.assign(
    {
      dexterity: _.random(1, 6) + _.random(1, 6) + _.random(1, 6),
    },
    user
  );

  // We still want the default hook's 'profile' behavior.
  if (options.profile) {
    customizedUser.profile = options.profile;
  }

  return customizedUser;
});
```

<ApiBox name="AccountsServer#validateLoginAttempt" instanceName="accountsServer" hasCustomExample/>

Call `validateLoginAttempt` with a callback to be called on login
attempts. It returns an object with a single method, `stop`. Calling
`stop()` unregisters the callback.

When a login attempt is made, the registered validate login callbacks
are called with a single argument, you can check the example:

```js
import { AccountsServer } from "meteor/accounts-base";
const options = {
  //...
};
const accountsServer = new AccountsServer(options);

accountsServer.validateLoginAttempt(
  ({
    type, // String
    allowed, // Boolean
    error, // Error
    user, // Object
    connection, // Object
    collection, // Object
    methodName, // String
    methodArguments, // Array<String>
  }) => {
    console.log(type);
    //        ˆˆˆˆˆˆ   The service name, such as "password" or "twitter".

    console.log(allowed);
    //        ˆˆˆˆˆˆ   Whether this login is allowed and will be successful (if not aborted
    //                 by any of the validateLoginAttempt callbacks). False if the login
    //                 will not succeed (for example, an invalid password or the login was
    //                 aborted by a previous validateLoginAttempt callback).

    console.log(error);
    //        ˆˆˆˆˆˆ   When `allowed` is false, the exception describing why the login
    //                 failed. It will be a `Meteor.Error` for failures reported to the
    //                 user (such as invalid password), and can be a another kind of
    //                 exception for internal errors.

    console.log(user);
    //        ˆˆˆˆˆˆ   When it is known which user was attempting to login,
    //                 the Meteor user object. This will always be present for successful logins.

    console.log(connection);
    //            ˆˆˆˆˆˆ The `connection` object the request came in on. See
    //                   [`Meteor.onConnection`](#meteor_onconnection) for details.

    console.log(collection);
    //            ˆˆˆˆˆˆ The `collection` The name of the Mongo.Collection or the
    //                   Mongo.Collection object to hold the users.

    console.log(methodName);
    //            ˆˆˆˆˆˆ The name of the Meteor method being used to login.
    //                   For example, "login", "loginWithPassword", or "loginWith<ExternalService>".

    console.log(methodArguments);
    //            ˆˆˆˆˆˆ An array of the arguments passed to the login method.
    //                   For example, `["username", "password"]`
  }
);
```

A validate login callback must return a truthy value for the login to
proceed. If the callback returns a falsy value or throws an
exception, the login is aborted. Throwing a `Meteor.Error` will
report the error reason to the user.

All registered validate login callbacks are called, even if one of the callbacks
aborts the login. The later callbacks will see the `allowed` field set to
`false` since the login will now not be successful. This allows later callbacks
to override an error from a previous callback; for example, you could override
the "Incorrect password" error with a different message.

Validate login callbacks that aren't explicitly trying to override a previous
error generally have no need to run if the attempt has already been determined
to fail, and should start with

```js
if (!attempt.allowed) {
  return false;
}
```

<ApiBox name="AccountsServer#beforeExternalLogin" instanceName="accountsServer"  hasCustomExample/>

Use this hook if you need to validate that user from an external service should
be allowed to login or create account.

```js
import { AccountsServer } from "meteor/accounts-base";
const options = {
  //...
};
const accountsServer = new AccountsServer(options);

accountsServer.beforeExternalLogin(({ type, data, user }) => {
  console.log(type);
  //       ˆˆˆˆˆˆ The service name, such as "google" or "twitter". Is a String

  console.log(data);
  //       ˆˆˆˆˆˆ Data retrieved from the service (eg: email, name, etc)
  //              Is an Object.

  console.log(user);
  //       ˆˆˆˆˆˆ If user was found in the database that matches the criteria from the service,
  //              their data will be provided here. Is an Object.
});
```

You should return a `Boolean` value, `true` if the login/registration should
proceed or `false` if it should terminate. In case of termination
the login attempt will throw an error `403`, with the message: `Login forbidden`.

<ApiBox name="AccountsServer#setAdditionalFindUserOnExternalLogin" hasCustomExample instanceName="accountsServer"/>

When allowing your users to authenticate with an external service, the process will
eventually call `Accounts.updateOrCreateUserFromExternalService`. By default, this
will search for a user with the `service.<servicename>.id`, and if not found will
create a new user. As that is not always desirable, you can use this hook as an
escape hatch to look up a user with a different selector, probably by `emails.address` or `username`. Note the function will only be called if no user was found with the
`service.<servicename>.id` selector.

The function will be called with a single argument, the info object:

```js
import { AccountsServer } from "meteor/accounts-base";
const options = {
  //...
};
const accountsServer = new AccountsServer(options);

accountsServer.setAdditionalFindUserOnExternalLogin(
  ({ serviceName, serviceData, options }) => {
    // serviceName: String
    //   The external service name, such as "google" or "twitter".
    // serviceData: Object
    //   The data returned by the service oauth request.
    // options: Object
    //   An optional arugment passed down from the oauth service that may contain
    //   additional user profile information. As the data in `options` comes from an
    //   external source, make sure you validate any values you read from it.
  }
);
```

The function should return either a user document or `undefined`. Returning a user
will result in the populating the `service.<servicename>` in your user document,
while returning `undefined` will result in a new user account being created.
If you would prefer that a new account not be created, you could throw an error
instead of returning.

Example:

```js
// If a user has already been created, and used their Google email, this will
// allow them to sign in with the Meteor.loginWithGoogle method later, without
// creating a new user.
Accounts.setAdditionalFindUserOnExternalLogin(
  ({ serviceName, serviceData }) => {
    if (serviceName === "google") {
      // Note: Consider security implications. If someone other than the owner
      // gains access to the account on the third-party service they could use
      // the e-mail set there to access the account on your app.
      // Most often this is not an issue, but as a developer you should be aware
      // of how bad actors could play.
      return Accounts.findUserByEmail(serviceData.email);
    }
  }
);
```

<ApiBox name="AccountsServer#registerLoginHandler" instanceName="accountsServer"/>

Use this to register your own custom authentication method. This is also used by all of the other inbuilt accounts packages to integrate with the accounts system.

There can be multiple login handlers that are registered. When a login request is made, it will go through all these handlers to find its own handler.

The registered handler callback is called with a single argument, the `options` object which comes from the login method. For example, if you want to login with a plaintext password, `options` could be `{ user: { username: <username> }, password: <password> }`,or `{ user: { email: <email> }, password: <password> }`.

The login handler should return `undefined` if it's not going to handle the login request or else the login result object.

<h2 id="accounts_rate_limit">Rate Limiting</h2>

By default, there are rules added to the [`DDPRateLimiter`](./DDPRateLimiter.md)
that rate limit logins, new user registration and password reset calls to a
limit of 5 requests per 10 seconds per session. These are a basic solution
to dictionary attacks where a malicious user attempts to guess the passwords
of legitimate users by attempting all possible passwords.

These rate limiting rules can be removed by calling
`Accounts.removeDefaultRateLimit()`. Please see the
[`DDPRateLimiter`](./DDPRateLimiter.md) docs for more information.

<ApiBox name="AccountsServer#addDefaultRateLimit" instanceName="accountsServer"/>

<ApiBox name="AccountsServer#removeDefaultRateLimit" instanceName="accountsServer"/>

## Passwords {#passwords}

The `accounts-password` package contains a full system for password-based
authentication. In addition to the basic username and password-based
sign-in process, it also supports email-based sign-in including
address verification and password recovery emails.

The Meteor server stores passwords using the
[bcrypt](http://en.wikipedia.org/wiki/Bcrypt) algorithm. This helps
protect against embarrassing password leaks if the server's database is
compromised.

To add password support to your application, run this command in your terminal:

```bash
meteor add accounts-password
```

> In addition to configuring the [`email`](./email.md) package's `MAIL_URL`, it is critical that you set proper values (specifically the `from` address) in [`Accounts.emailTemplates`](#Accounts-emailTemplates) to ensure proper delivery of e-mails!

You can construct your own user interface using the
functions below, or use the [`accounts-ui` package](../packages/accounts-ui.md) to
include a turn-key user interface for password-based sign-in.

<ApiBox name="Accounts.createUser" />

On the client, this function logs in as the newly created user on
successful completion. On the server, it returns the newly created user
id.

On the client, you must pass `password` and at least one of `username` or `email` &mdash; enough information for the user to be able to log in again later. If there are existing users with a username or email only differing in case, `createUser` will fail. The callback's `error.reason` will be `'Username already exists.'` or `'Email already exists.'` In the latter case, the user can then either [login](accounts.html#Meteor-loginWithPassword) or [reset their password](#Accounts-resetPassword).

On the server, you do not need to specify `password`, but the user will not be able to log in until it has a password (eg, set with [`Accounts.setPasswordAsync`](#Accounts-setPasswordAsync)). To create an account without a password on the server and still let the user pick their own password, call `createUser` with the `email` option and then call [`Accounts.sendEnrollmentEmail`](#Accounts-sendEnrollmentEmail). This will send the user an email with a link to set their initial password.

By default the `profile` option is added directly to the new user document. To
override this behavior, use [`Accounts.onCreateUser`](#Accounts-onCreateUser).

This function is only used for creating users with passwords. The external
service login flows do not use this function.

Instead of modifying documents in the [`Meteor.users`](#Meteor-users) collection
directly, use these convenience functions which correctly check for case
insensitive duplicates before updates.

<ApiBox name="Accounts.createUserAsync" />

<ApiBox name="Accounts.createUserVerifyingEmail" />

<ApiBox name="Accounts.setUsername" />

<ApiBox name="Accounts.addEmail" />

By default, an email address is added with `{ verified: false }`. Use
[`Accounts.sendVerificationEmail`](#Accounts-sendVerificationEmail) to send an
email with a link the user can use to verify their email address.

<ApiBox name="Accounts.removeEmail" />

<ApiBox name="Accounts.verifyEmail" />

If the user trying to verify the email has 2FA enabled, this error will be thrown:

- "Email verified, but user not logged in because 2FA is enabled [2fa-enabled]": No longer signing in the user automatically if the user has 2FA enabled.

This function accepts tokens passed into the callback registered with
[`Accounts.onEmailVerificationLink`](#Accounts-onEmailVerificationLink).

<ApiBox name="Accounts.findUserByUsername" />

<ApiBox name="Accounts.findUserByEmail" />

Use the below functions to initiate password changes or resets from the server
or the client.

<ApiBox name="Accounts.changePassword" />

<ApiBox name="Accounts.forgotPassword" />

This triggers a call
to [`Accounts.sendResetPasswordEmail`](#Accounts-sendResetPasswordEmail)
on the server. When the user visits the link in this email, the callback
registered with [`Accounts.onResetPasswordLink`](#Accounts-onResetPasswordLink)
will be called.

If you are using the [`accounts-ui` package](../packages/accounts-ui.md), this is handled
automatically. Otherwise, it is your responsibility to prompt the user for the
new password and call `resetPassword`.

<ApiBox name="Accounts.resetPassword" />

This function accepts tokens passed into the callbacks registered with
[`AccountsClient#onResetPasswordLink`](#Accounts-onResetPasswordLink) and
[`Accounts.onEnrollmentLink`](#Accounts-onEnrollmentLink).

If the user trying to reset the password has 2FA enabled, this error will be thrown:

- "Changed password, but user not logged in because 2FA is enabled [2fa-enabled]": No longer signing in the user automatically if the user has 2FA enabled.

<ApiBox name="Accounts.setPasswordAsync" />

<ApiBox name="Accounts.sendResetPasswordEmail" />

When the user visits the link in this email, the callback registered with
[`AccountsClient#onResetPasswordLink`](#Accounts-onResetPasswordLink) will be called.

To customize the contents of the email, see
[`Accounts.emailTemplates`](#Accounts-emailTemplates).

<ApiBox name="Accounts.sendEnrollmentEmail" />

When the user visits the link in this email, the callback registered with
[`Accounts.onEnrollmentLink`](#Accounts-onEnrollmentLink) will be called.

To customize the contents of the email, see
[`Accounts.emailTemplates`](#Accounts-emailTemplates).

<ApiBox name="Accounts.sendVerificationEmail" />

When the user visits the link in this email, the callback registered with
[`Accounts.onEmailVerificationLink`](#Accounts-onEmailVerificationLink) will
be called.

To customize the contents of the email, see
[`Accounts.emailTemplates`](#Accounts-emailTemplates).

<ApiBox name="Accounts.onResetPasswordLink" />

<ApiBox name="Accounts.onEnrollmentLink" />

<ApiBox name="Accounts.onEmailVerificationLink" />

<ApiBox name="Accounts.emailTemplates" />

This is an `Object` with several fields that are used to generate text/html
for the emails sent by `sendResetPasswordEmail`, `sendEnrollmentEmail`,
and `sendVerificationEmail`.

Set the fields of the object by assigning to them:

- `from`: (**required**) A `String` with an [RFC5322](http://tools.ietf.org/html/rfc5322) From
  address. By default, the email is sent from `no-reply@example.com`. **If you
  want e-mails to send correctly, this should be changed to your own domain
  as most e-mail providers will reject mail sent from `example.com`.**
- `siteName`: The public name of your application. Defaults to the DNS name of
  the application (eg: `awesome.meteor.com`).
- `headers`: An `Object` for custom email headers as described in
  [`Email.send`](./email.md#Email-send).
- `resetPassword`: An `Object` with the fields:
- `from`: A `Function` used to override the `from` address defined
  by the `emailTemplates.from` field.
- `subject`: A `Function` that takes a user object and returns
  a `String` for the subject line of a reset password email.
- `text`: An optional `Function` that takes a user object and a url, and
  returns the body text for a reset password email.
- `html`: An optional `Function` that takes a user object and a
  url, and returns the body html for a reset password email.
- `enrollAccount`: Same as `resetPassword`, but for initial password setup for
  new accounts.
- `verifyEmail`: Same as `resetPassword`, but for verifying the users email
  address.

Example:

```js
import { Accounts } from "meteor/accounts-base";

Accounts.emailTemplates.siteName = "AwesomeSite";
Accounts.emailTemplates.from = "AwesomeSite Admin <accounts@example.com>";

Accounts.emailTemplates.enrollAccount.subject = (user) => {
  return `Welcome to Awesome Town, ${user.profile.name}`;
};

Accounts.emailTemplates.enrollAccount.text = (user, url) => {
  return (
    "You have been selected to participate in building a better future!" +
    " To activate your account, simply click the link below:\n\n" +
    url
  );
};

Accounts.emailTemplates.resetPassword.from = () => {
  // Overrides the value set in `Accounts.emailTemplates.from` when resetting
  // passwords.
  return "AwesomeSite Password Reset <no-reply@example.com>";
};
Accounts.emailTemplates.verifyEmail = {
  subject() {
    return "Activate your account now!";
  },
  text(user, url) {
    return `Hey ${user}! Verify your e-mail by following this link: ${url}`;
  },
};
```

<h3 id="enabling-2fa">Enable 2FA for this package</h3>

You can add 2FA to your login flow by
using the package [accounts-2fa](../packages/accounts-2fa.md).
You can find an example showing how this would look like [here](../packages/accounts-2fa.md#working-with-accounts-password).
