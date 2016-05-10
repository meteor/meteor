---
title: Accounts
order: 8
---

The Meteor Accounts system builds on top of the `userId` support in
[`publish`](#publish_userId) and [`methods`](#method_userId). The core
packages add the concept of user documents stored in the database, and
additional packages add [secure password
authentication](#accounts_passwords), [integration with third party
login services](#meteor_loginwithexternalservice), and a [pre-built user
interface](#accountsui).

The basic Accounts system is in the `accounts-base` package, but
applications typically include this automatically by adding one of the
login provider packages: `accounts-password`, `accounts-facebook`,
`accounts-github`, `accounts-google`, `accounts-meetup`,
`accounts-twitter`, or `accounts-weibo`.

Read more about customizing user accounts in the [Accounts](http://guide.meteor.com/accounts.html) article in the Meteor Guide.

{% apibox "Meteor.user" %}

Retrieves the user record for the current user from
the [`Meteor.users`](#meteor_users) collection.

On the client, this will be the subset of the fields in the document that
are published from the server (other fields won't be available on the
client). By default the server publishes `username`, `emails`, and
`profile` (writable by user). See [`Meteor.users`](#meteor_users) for more on
the fields used in user documents.

{% apibox "Meteor.userId" %}

{% apibox "Meteor.users" %}

This collection contains one document per registered user. Here's an example
user document:

```js
{
  _id: "bbca5d6a-2156-41c4-89da-0329e8c99a4f",  // Meteor.userId()
  username: "cool_kid_13", // unique name
  emails: [
    // each email address can only belong to one user.
    { address: "cool@example.com", verified: true },
    { address: "another@different.com", verified: false }
  ],
  createdAt: Wed Aug 21 2013 15:16:52 GMT-0700 (PDT),
  profile: {
    // The profile is writable by the user by default.
    name: "Joe Schmoe"
  },
  services: {
    facebook: {
      id: "709050", // facebook id
      accessToken: "AAACCgdX7G2...AbV9AZDZD"
    },
    resume: {
      loginTokens: [
        { token: "97e8c205-c7e4-47c9-9bea-8e2ccc0694cd",
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
  a Boolean which is true if the user has [verified the
  address](#accounts_verifyemail) with a token sent over email.
- `createdAt`: the Date at which the user document was created.
- `profile`: an Object which the user can create and update with any data.
  Do not store anything on `profile` that you wouldn't want the user to edit
  unless you have a deny rule on the `Meteor.users` collection.
- `services`: an Object containing data used by particular
  login services. For example, its `reset` field contains
  tokens used by [forgot password](#accounts_forgotpassword) links,
  and its `resume` field contains tokens used to keep you
  logged in between sessions.

Like all [Mongo.Collection](#collections)s, you can access all
documents on the server, but only those specifically published by the server are
available on the client.

By default, the current user's `username`, `emails` and `profile` are
published to the client. You can publish additional fields for the
current user with:

```js
// server
Meteor.publish("userData", function () {
  if (this.userId) {
    return Meteor.users.find({_id: this.userId},
                             {fields: {'other': 1, 'things': 1}});
  } else {
    this.ready();
  }
});

// client
Meteor.subscribe("userData");
```

If the autopublish package is installed, information about all users
on the system is published to all clients. This includes `username`,
`profile`, and any fields in `services` that are meant to be public
(eg `services.facebook.id`,
`services.twitter.screenName`). Additionally, when using autopublish
more information is published for the currently logged in user,
including access tokens. This allows making API calls directly from
the client for services that allow this.

Users are by default allowed to specify their own `profile` field with
[`Accounts.createUser`](#accounts_createuser) and modify it with
`Meteor.users.update`. To allow users to edit additional fields, use
[`Meteor.users.allow`](#allow). To forbid users from making any modifications to
their user document:

```js
Meteor.users.deny({update: function () { return true; }});
```

{% apibox "Meteor.loggingIn" %}

For example, [the `accounts-ui` package](#accountsui) uses this to display an
animation while the login request is being processed.

{% apibox "Meteor.logout" %}

{% apibox "Meteor.logoutOtherClients" %}

For example, when called in a user's browser, connections in that browser
remain logged in, but any other browsers or DDP clients logged in as that user
will be logged out.

{% apibox "Meteor.loginWithPassword" %}

If there are multiple users with a username or email only differing in case, a case sensitive match is required. Although `createUser` won't let you create users with ambiguous usernames or emails, this could happen with existing databases or if you modify the users collection directly.

This function is provided by the `accounts-password` package. See the
[Passwords](#accounts_passwords) section below.


{% apibox "Meteor.loginWith<ExternalService>" %}

Available functions are:

* `Meteor.loginWithMeteorDeveloperAccount`
* `Meteor.loginWithFacebook`
* `Meteor.loginWithGithub`
* `Meteor.loginWithGoogle`
* `Meteor.loginWithMeetup`
* `Meteor.loginWithTwitter`
* `Meteor.loginWithWeibo`

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
- Google: <https://developers.google.com/accounts/docs/OAuth2Login#scopeparameter>
- Meetup: <http://www.meetup.com/meetup_api/auth/#oauth2-scopes>
- Twitter, Weibo, Meteor developer accounts: `requestPermissions` currently not supported

External login services typically require registering and configuring
your application before use. The easiest way to do this is with the
[`accounts-ui` package](#accountsui) which presents a step-by-step guide
to configuring each service. However, the data can be also be entered
manually in the `ServiceConfiguration.configurations` collection, which
is exported by the `service-configuration` package.

<h3 id="service-configuration">Configuring Services</h3>

First, add the service configuration package:

```bash
meteor add service-configuration
```

Then, in your app:

```js
ServiceConfiguration.configurations.upsert(
  { service: "weibo" },
  {
    $set: {
      clientId: "1292962797",
      loginStyle: "popup",
      secret: "75a730b58f5691de5522789070c319bc"
    }
  }
);
```

Each external service has its own login provider package and login function. For
example, to support GitHub login, run in your terminal:

```bash
meteor add accounts-github
```

and use the `Meteor.loginWithGithub` function:

```javascript
Meteor.loginWithGithub({
  requestPermissions: ['user', 'public_repo']
}, function (err) {
  if (err)
    Session.set('errorMessage', err.reason || 'Unknown error');
});
```

Login service configuration is sent from the server to the client over DDP when
your app starts up; you may not call the login function until the configuration
is loaded. The function `Accounts.loginServicesConfigured()` is a reactive data
source that will return true once the login service is configured; you should
not make login buttons visible or active until it is true.

Ensure that your [`$ROOT_URL`](#meteor_absoluteurl) matches the authorized
domain and callback URL that you configure with the external service (for
instance, if you are running Meteor behind a proxy server, `$ROOT_URL` should be
the externally-accessible URL, not the URL inside your proxy).

<h3 id="popup-vs-redirect-flow">Popup versus redirect flow</h3>

When configuring OAuth login with a provider (such as Facebook or Google), Meteor lets you choose a popup- or redirect-based flow. In a popup-based flow, when a user logs in, they will be prompted to login at the provider in a popup window. In a redirect-based flow, the user's whole browser window will be redirected to the login provider, and the window will redirect back to your app when the login is completed.

You can also pick which type of login to do by passing an option to [`Meteor.loginWith<ExternalService>`](#meteor_loginwithexternalservice)

Usually, the popup-based flow is preferable because the user will not have to reload your whole app at the end of the login flow. However, the popup-based flow requires browser features such as `window.close` and `window.opener` that are not available in all mobile environments. In particular, we recommend using `Meteor.loginWith<ExternalService>({ loginStyle: "redirect" })` in the following environments:

* Inside UIWebViews (when your app is loaded inside a mobile app)
* In Safari on iOS8 (`window.close` is not supported due to a bug)

{% apibox "currentUser" %}

{% apibox "loggingIn" %}

{% apibox "Accounts.ui.config" %}

Example:

```js
Accounts.ui.config({
  requestPermissions: {
    facebook: ['user_likes'],
    github: ['user', 'repo']
  },
  requestOfflineToken: {
    google: true
  },
  passwordSignupFields: 'USERNAME_AND_OPTIONAL_EMAIL'
});
```
