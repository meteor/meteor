{{#template name="basicAccounts"}}

<h2 id="accounts"><span>Accounts</span></h2>

To get accounts functionality, add one or more of the following packages to
your app with `meteor add`:

- `accounts-ui`: This package allows you to use
  `{{dstache}}> loginButtons}}` in your templates to add an automatically
  generated UI that will let users log into your app. There are several
  community alternatives to this package that change the appearance, or you
  can not use it and use the [advanced Accounts methods](#accounts) instead.
- `accounts-password`: This package will allow users to log in with passwords.
  When you add it the `loginButtons` dropdown will automatically gain email
  and password fields.
- `accounts-facebook`, `accounts-google`, `accounts-github`, `accounts-twitter`,
  and community packages for other services will allow your users to log
  in with their accounts from other websites. These will automatically add
  buttons to the `loginButtons` dropdown.

<h3 id="loginButtons" class="api-title">
  <a class="name selflink" href="#b-loginButtons">{{dstache}}> loginButtons}}</a>
  <span class="locus">Client</span>
</h3>

Include the `loginButtons` template somewhere in your HTML to use Meteor's
default UI for logging in. To use this, you need to add the `accounts-ui` package:

```
$ meteor add accounts-ui
```

{{> autoApiBox "Meteor.user"}}

Get the logged in user from the [`Meteor.users`](#meteor_users) collection.
Equivalent to `Meteor.users.findOne(Meteor.userId())`.

{{> autoApiBox "Meteor.userId"}}

{{> autoApiBox "Meteor.users"}}

This collection contains one document per registered user. Here's an example
user document:

```
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
- `profile`: an Object which (by default) the user can create
  and update with any data.
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

    Meteor.users.deny({update: function () { return true; }});


{{> autoApiBox "currentUser"}}

{{/template}}
