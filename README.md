meteor-roles
============

Roles-based authorization package for Meteor - compatible with built-in accounts package.

### Usage

User objects now have an extra 'roles' field which contains the user's roles.

-- **Server** --

NOTE: Add checks to publish methods and other sensitive functions to restrict data available to client.

Check user roles before publishing sensitive data:
```js
// server/publish.js

// Give authorized users access to sensitive data
Meteor.publish('secrets', function () {
  if (Roles.userIsInRole(this.userId, ['view-secrets','admin'])) {
    
    return Meteor.secrets.find();
    
  } else {
    
    // user not authorized. do not publish secrets
    this.complete();
    return;
  
  }
});
```

Publish the logged-in user's roles for convenience checks client-side, like so:
```js
// server/publish.js

// Give Users access to their own roles
Meteor.publish('ownUserData', function () {
  var user = Meteor.users.findOne(this.userId),
      fields = {roles:1};

  return Meteor.users.find({_id:this.userId}, {fields: fields});
});
```


-- **Client** --

NOTE: Like all Meteor applications, client-side checks are a convenience, rather than a true security implementation 
since Meteor bundles the same client-side code to all users.  Any sensitive data needs to be controlled server-side to prevent unwanted disclosure.

To be clear, Meteor sends all templates, client-side javascript, and published data to the client's browser.  This is by design and is a good thing.  The following example is just sugar to help improve the user experience for normal users.  Those interested in seeing the the 'admin' template in the example below will still be able to with a little work but this is not a problem as long as the actual data is restricted server-side.

```js
// client/myApp.js

Meteor.subscribe('ownUserData');

Template.header.isInRole = function (role) {
  var user = Meteor.user();

  if (!user) {
    return false;
  }

  return _.contains(user.roles, role);
}
```
```handlebars
<!-- client/myApp.html -->

<template name="header">
  {{#if isInRole 'admin'}}
    ... stuff only admins care about.  
    ... note: anything published by server will be sent to the client, so lock it down server-side first
  {{/if}}
</template>
```

### Documentation

Online API docs found here: http://alanning.github.com/meteor-roles/

API docs generated using [YUIDoc][2]

To re-generate documentation:
  1. install YUIDoc
  2. cd 'meteor-roles' directory (root)
  3. yuidoc

To serve documentation locally:
  1. install YUIDoc
  2. cd 'meteor-roles' directory (root)
  3. yuidoc --server
  4. point browser at http://localhost:3000/


### Tests


To run tests: 
  1. install [Meteorite][1]
  2. cd 'roles' directory
  3. mrt
  4. point browser at http://localhost:3000/

_NOTE_: If you see an error message regarding **'roles package does not exist'** that means you are trying to run 'mrt' in the wrong directory.  See step 2.





[1]: https://github.com/oortcloud/meteorite "Meteorite"

[2]: http://yui.github.com/yuidoc/ "YUIDoc"
