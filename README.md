meteor-roles
============

Authorization package for Meteor - compatible with built-in accounts package.

<br />

<a name="toc"></a>
### Table of Contents
* [Contributors](#user-content-contributors)
* [Authorization](#user-content-authorization)
* [Permissions vs roles](#user-content-naming)
* [What are "groups"?](#groups)
* [Changes to default Meteor](#user-content-changes)
* [Installation](#user-content-installing)
* [Usage examples](#user-content-usage)
* [Online API docs](#user-content-docs)
* [Example apps](#user-content-example-apps)
* [Running tests](#user-content-testing)


<br />


<a name="contributors"></a>
### Contributors

Thanks to:

  * [@challett](https://github.com/challett)
  * [@ianserlin](https://github.com/ianserlin)
  * [@leebenson](https://github.com/leebenson)
  * [@pward123](https://github.com/pward123)
  * [@dandv](https://github.com/dandv)
  * [@aldeed](https://github.com/aldeed)
  * [@kevb](https://github.com/kevb)
  * [@zimme](https://github.com/zimme)
  * [@danieljonce](https://github.com/danieljonce)
  * [@pascoual](https://github.com/pascoual)
  * [@nickmoylan](https://github.com/nickmoylan)
  * [@mcrider](https://github.com/mcrider)
  * [@alanning](https://github.com/alanning)

<br />


<a name="authorization"></a>
### Authorization

This package lets you attach permissions to a user which you can then check against later when deciding whether to grant access to Meteor methods or publish data.  The core concept is very simple, essentially you are attaching strings to a user object and then checking for the existance of those strings later. In some sense, it is very similar to tags on blog posts. This package provides helper methods to make the process of adding, removing, and verifying those permissions easier.

All versions of Meteor from 0.5 to current are supported (excluding Meteor 0.9.1).  UI-less apps are supported as well.

    v1.1.0 - adds support for per-group assignment of permissions

    v1.2.0 - adds the special Roles.GLOBAL_GROUP, used to provide blanket permissions across all groups


<br />

<a name="naming"></a>
### Permissions vs roles  (or What's in a name...)

Although the name of this package is 'roles', you can define your permissions however you like.  They are essentially just tags that you assign on a user and which you can check for later.

You can have traditional roles like, "admin" or "webmaster", or you can assign more granular permissions such as, "view-secrets", "users.view", or "users.manage".  Often times more granular is actually better because you are able to handle all those pesky edge cases that come up in real-life usage without creating a ton of higher-level 'roles'.  To the roles package, it's all strings.

<br />

<a name="groups"></a>
### What are "groups"?

Sometimes it's useful to let a user have independent sets of permissions.  The `roles` package calls these independent sets, "groups" for lack of a better term.  You can think of them as "partitions" if that is more clear.  Users can have one set of permissions in group A and another set of permissions in group B.  Let's go through an example of this using soccer/football teams as groups.

```
Roles.addUsersToRoles(joesUserId, ['manage-team','schedule-game'], 'manchester-united.com')
Roles.addUsersToRoles(joesUserId, ['player','goalie'], 'real-madrid.com')

Roles.userIsInRole(joesUserId, 'manage-team', 'manchester-united.com')  // => true
Roles.userIsInRole(joesUserId, 'manage-team', 'real-madrid.com')  // => false
```

In this example we can see that Joe manages Manchester United and plays for Real Madrid.  By using groups, we can assign permissions independently and make sure that they don't get mixed up between groups.

NOTE: If you use groups for _ANY_ of your users, you should use groups for _ALL_ of your users.  This is due to how the roles package stores the roles internally in the database.  In roles 2.0, you won't need to worry about this anymore, we'll have a default group that will hold roles not assigned to a specific group.

Now, let's take a look at how to use the Global Group.  Say we want to give Joe permission to do something across all of our groups.  That's what the Global Group is for:

```
Roles.addUsersToRoles(joesUserId, 'super-admin', Roles.GLOBAL_GROUP)

if (Roles.userIsInRole(joesUserId, ['manage-team', 'super-admin'], 'real-madrid.com')) {

  // True!  Even though Joe doesn't manage Real Madrid, he is 'super-admin' in
  // the Global Group so this check succeeds.

}
```

<br />

<a name="changes"></a>
### Changes to default Meteor behavior

  1. User entries in the `Meteor.users` collection gain a new field named `roles` corresponding to the user's roles. †
  2. A new collection `Meteor.roles` contains a global list of defined role names. ††
  3. The currently logged-in user's `roles` field is automatically published to the client.

<br />

† The type of the `roles` field depends on whether or not groups are used:
```js
Roles.addUsersToRoles(bobsUserId, ['manage-team','schedule-game'])
// internal representation - no groups
// user.roles = ['manage-team','schedule-game']

Roles.addUsersToRoles(joesUserId, ['manage-team','schedule-game'], 'manchester-united.com')
Roles.addUsersToRoles(joesUserId, ['player','goalie'], 'real-madrid.com')
// internal representation - groups
// NOTE: MongoDB uses periods to represent hierarchy so periods in group names
//   are converted to underscores.
//
// user.roles = {
//   'manchester-united_com': ['manage-team','schedule-game'],
//   'real-madrid_com': ['player','goalie']
// }
```

<em>Note: See the `addUsersToRoles` [documentation](http://alanning.github.io/meteor-roles/classes/Roles.html) for restrictions on group names.</em>


†† The `Meteor.roles` collection is currently only for convenience on the UI-side and is not used functionally within this package.  In the future it may be used to support role hierarchies.  Since it is not currently required, it is not automatically published to the client.  Here's how you would publish it to every client without needing a subscription:

```js
// in server/publish.js
Meteor.publish(null, function (){
  return Meteor.roles.find({})
})
```

<br />

<a name="installing"></a>
### Installing

#### Meteor 0.9 - latest

1. Add one of the built-in accounts packages so the Meteor.users collection exists.  From a command prompt:
    ```bash
    meteor add accounts-password
    ```

3. Add this package to your project.  From a command prompt:
    ```bash
    meteor add alanning:roles
    ```

4. Run your application:
    ```bash
    meteor
    ```

#### Meteor 0.8.3 and below (meteorite)

1. Add one of the built-in accounts packages so the Meteor.users collection exists.  From a command prompt:
    ```bash
    meteor add accounts-password
    ```

2. Install [Meteorite][1]

3. Add this smart package to your project.  From a command prompt:
    ```bash
    mrt add roles
    ```

4. Run your application:
    ```bash
    meteor
    ```


NOTE for Meteor 0.8-0.8.3:  Manually add the 'ui' package to your '.meteor/packages' file so that roles knows you are using it.  Otherwise, the 'isInRole' client-side helper will not be registered.  Since some versions of Meteor had 'standard-app-packages' without 'ui' there is no other way to detect its use.


<br />


<a name="usage"></a>
### Usage Examples

<br />

Here are some potential use cases:

<br />

-- **Server** --


Add users to roles:
```js
var users = [
      {name:"Normal User",email:"normal@example.com",roles:[]},
      {name:"View-Secrets User",email:"view@example.com",roles:['view-secrets']},
      {name:"Manage-Users User",email:"manage@example.com",roles:['manage-users']},
      {name:"Admin User",email:"admin@example.com",roles:['admin']}
    ];

_.each(users, function (user) {
  var id;

  id = Accounts.createUser({
    email: user.email,
    password: "apple1",
    profile: { name: user.name }
  });

  if (user.roles.length > 0) {
    // Need _id of existing user record so this call must come
    // after `Accounts.createUser` or `Accounts.onCreate`
    Roles.addUsersToRoles(id, user.roles, 'default-group');
  }

});
```

<br />
Note that the `Roles.addUsersToRoles` call needs to come _after_ `Accounts.createUser` or `Accounts.onCreate` or else the roles package won't be able to find the user record (since it hasn't been created yet).  This SO answer gives more detail: http://stackoverflow.com/a/22650399/219238

<br />

Check user roles before publishing sensitive data:
```js
// server/publish.js

// Give authorized users access to sensitive data by group
Meteor.publish('secrets', function (group) {
  if (Roles.userIsInRole(this.userId, ['view-secrets','admin'], group)) {

    return Meteor.secrets.find({group: group});

  } else {

    // user not authorized. do not publish secrets
    this.stop();
    return;

  }
});
```

<br />

Prevent non-authorized users from creating new users:
```js
Accounts.validateNewUser(function (user) {
  var loggedInUser = Meteor.user();

  if (Roles.userIsInRole(loggedInUser, ['admin','manage-users'])) {
    // NOTE: This example assumes the user is not using groups.
    return true;
  }

  throw new Meteor.Error(403, "Not authorized to create new users");
});
```

<br />

Prevent access to certain functionality, such as deleting a user:
```js
// server/userMethods.js

Meteor.methods({
  /**
   * delete a user from a specific group
   *
   * @method deleteUser
   * @param {String} targetUserId _id of user to delete
   * @param {String} group Company to update permissions for
   */
  deleteUser: function (targetUserId, group) {
    var loggedInUser = Meteor.user()

    if (!loggedInUser ||
        !Roles.userIsInRole(loggedInUser,
                            ['manage-users', 'support-staff'], group)) {
      throw new Meteor.Error(403, "Access denied")
    }

    // remove permissions for target group
    Roles.setUserRoles(targetUserId, [], group)

    // do other actions required when a user is removed...
  }
})
```

<br />

Manage a user's permissions:
```js
// server/userMethods.js

Meteor.methods({
  /**
   * update a user's permissions
   *
   * @param {Object} targetUserId Id of user to update
   * @param {Array} roles User's new permissions
   * @param {String} group Company to update permissions for
   */
  updateRoles: function (targetUserId, roles, group) {
    var loggedInUser = Meteor.user()

    if (!loggedInUser ||
        !Roles.userIsInRole(loggedInUser,
                            ['manage-users', 'support-staff'], group)) {
      throw new Meteor.Error(403, "Access denied")
    }

    Roles.setUserRoles(targetUserId, roles, group)
  }
})
```

<br />

-- **Client** --

Client javascript has access to all the same Roles functions as the server with the addition of a `isInRole` handlebars helper which is automatically registered by the Roles package.

As with all Meteor applications, client-side checks are a convenience, rather than a true security implementation
since Meteor bundles the same client-side code to all users.  Providing the Roles functions client-side also allows for latency compensation during Meteor method calls.

NOTE: Any sensitive data needs to be controlled server-side to prevent unwanted disclosure. To be clear, Meteor sends all templates, client-side javascript, and published data to the client's browser.  This is by design and is a good thing.  The following example is just sugar to help improve the user experience for normal users.  Those interested in seeing the 'admin_nav' template in the example below will still be able to do so by manually reading the bundled `client.js` file. It won't be pretty but it is possible. But this is not a problem as long as the actual data is restricted server-side.


To check for permissions when not using groups:

```handlebars
<!-- client/myApp.html -->

<template name="header">
  ... regular header stuff
  {{#if isInRole 'admin'}}
    {{> admin_nav}}  
  {{/if}}
  {{#if isInRole 'admin,editor'}}
    {{> editor_stuff}}
  {{/if}}
</template>
```

To check for permissions when using groups:

```handlebars
<!-- client/myApp.html -->

<template name="header">
  ... regular header stuff
  {{#if isInRole 'admin,editor' 'group1'}}
    {{> editor_stuff}}  
  {{/if}}
</template>
```

<br />


<a name="docs"></a>
### API Docs

Online API docs found here: http://alanning.github.io/meteor-roles/classes/Roles.html

API docs generated using [YUIDoc][2]

To re-generate documentation:
  1. install YUIDoc
  2. `cd meteor-roles`
  3. `yuidoc`

To serve documentation locally:
  1. install YUIDoc
  2. `cd meteor-roles`
  3. `yuidoc --server`
  4. point browser at http://localhost:3000/


<br />


<a name="example-apps"></a>
### Example Apps

The `examples` directory contains Meteor apps which show off the following features:
* Server-side publishing with authorization to secure sensitive data
* Client-side navigation with link visibility based on user permissions
* 'Sign-in required' app with up-front login page using `accounts-ui`
* Client-side routing


The only difference among the example apps is which routing package is used.

View the `meteor-router` example app online @  <a href="http://roles.meteor.com/" target="_blank">http://roles.meteor.com/</a>


_Iron Router or Flow Router_

  1. `git clone https://github.com/alanning/meteor-roles.git`
  2. either
    * `cd meteor-roles/examples/iron-router` or
    * `cd meteor-roles/examples/flow-router`
  3. `meteor`
  4. point browser to `http://localhost:3000`

<br />

_Deprecated routing packages: Mini-Pages or Router_

  1. install [Meteorite][1]
  2. `git clone https://github.com/alanning/meteor-roles.git`
  3. either
    * `cd meteor-roles/examples/router` or
    * `cd meteor-roles/examples/mini-pages`
  4. `mrt update`
  5. `meteor`
  6. point browser to `http://localhost:3000`

<br />


<a name="testing"></a>
### Tests


To run tests:
  1. `cd meteor-roles`
  2. `meteor test-packages ./roles`
  3. point browser at http://localhost:3000/

_NOTE_: If you see an error message regarding **"The package named roles does not exist"** that means you are either:
  a) in the wrong directory or
  b) left off the './' in front of 'roles' in step 2.  

Step 2 needs to be run in the main 'meteor-roles' directory and the './' is needed because otherwise Meteor only looks in directories named 'packages'.






[1]: https://github.com/oortcloud/meteorite "Meteorite"

[2]: http://yui.github.com/yuidoc/ "YUIDoc"
