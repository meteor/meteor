meteor-roles
============

Roles-based authorization package for Meteor - compatible with built-in accounts package.

<br />
### Contributors

Thanks to [@nickmoylan](https://github.com/nickmoylan) and [@mcrider](https://github.com/mcrider)!

<br />

### Example Apps

The ```examples``` directory contains Meteor apps which show off the following features:
* Server-side publishing with authorization to secure sensitive data
* Client-side navigation with link visibility based on user permissions
* 'Sign-in required' app with up-front login page using ```accounts-ui```
* Client-side routing

The only difference between the two example apps is the routing packages used: one uses ```meteor-router``` and the other uses ```meteor-mini-pages```.

View the ```meteor-router``` example app online @  <a href="http://roles.meteor.com/" target="_blank">http://roles.meteor.com/</a>
  
Run locally:
  1. install [Meteorite][1]
  2. ```git clone https://github.com/alanning/meteor-roles.git```
  3. either
    * ```cd meteor-roles/examples/router``` or
    * ```cd meteor-roles/examples/mini-pages```
  4. ```mrt```
  5. point browser to ```http://localhost:3000```

<br />

### Changes to default Meteor behavior

  1. User entries in the ```Meteor.users``` collection gain a new field named ```roles``` which is an array of strings corresponding to the user's roles.
  2. A new collection ```Meteor.roles``` ** contains a global list of defined role names.
  3. The currently logged-in user's ```roles``` field is automatically published to the client.

<br />
** ```Meteor.roles``` is not published by default.  Here's how you would publish it to every client without needing a subscription:

```js
// in server/publish.js
Meteor.publish(null, function (){ 
  return Meteor.roles.find({})
})
```

<br />

### Usage

1. Add one of the built-in accounts packages so the Meteor.users collection exists.  From a command prompt:
```bash
meteor add accounts-password
```

2. Install [Meteorite][1]
  
3. Add this smart package to your project.  From a command prompt:
```bash
mrt add roles
```

4. Run your application using Meteorite (rather than the normal meteor):
```bash
mrt
```


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
      Roles.addUsersToRoles(id, user.roles);
    }
  
  });
```

<br />

Check user roles before publishing sensitive data:
```js
// server/publish.js

// Give authorized users access to sensitive data
Meteor.publish('secrets', function () {
  if (Roles.userIsInRole(this.userId, ['view-secrets','admin'])) {
    
    return Meteor.secrets.find();
    
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
      return true;
    }

    throw new Meteor.Error(403, "Not authorized to create new users");
  });
```

<br />

-- **Client** --

Client javascript has access to all the same Roles functions as the server with the addition of a ```isInRole``` handlebars helper which is automatically registered by the Roles package.

Like all Meteor applications, client-side checks are a convenience, rather than a true security implementation 
since Meteor bundles the same client-side code to all users.  Providing the Roles functions client-side also allows for latency compensation during Meteor method calls.

NOTE: Any sensitive data needs to be controlled server-side to prevent unwanted disclosure. To be clear, Meteor sends all templates, client-side javascript, and published data to the client's browser.  This is by design and is a good thing.  The following example is just sugar to help improve the user experience for normal users.  Those interested in seeing the 'admin_nav' template in the example below will still be able to do so by manually reading the bundled ```client.js``` file. It won't be pretty but it is possible. But this is not a problem as long as the actual data is restricted server-side.

```handlebars
<!-- client/myApp.html -->

<template name="header">
  ... regular header stuff
  {{#if isInRole 'admin'}}
    {{> admin_nav}}  
  {{/if}}
</template>
```

<br />

### Documentation

Online API docs found here: http://alanning.github.com/meteor-roles/

API docs generated using [YUIDoc][2]

To re-generate documentation:
  1. install YUIDoc
  2. ```cd meteor-roles```
  3. ```yuidoc```

To serve documentation locally:
  1. install YUIDoc
  2. ```cd meteor-roles```
  3. ```yuidoc --server```
  4. point browser at http://localhost:3000/


<br />

### Tests


To run tests: 
  1. ```cd meteor-roles```
  2. ```meteor test-packages ./roles```
  3. point browser at http://localhost:3000/

_NOTE_: If you see an error message regarding **"The package named roles does not exist"** that means you are either:
  a) in the wrong directory or 
  b) left off the './' in front of 'roles' in step 2.  
  
Step 2 needs to be run in the main 'meteor-roles' directory and the './' is needed because otherwise Meteor only looks in directories named 'packages'.






[1]: https://github.com/oortcloud/meteorite "Meteorite"

[2]: http://yui.github.com/yuidoc/ "YUIDoc"
