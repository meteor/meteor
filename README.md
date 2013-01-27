meteor-roles
============

Roles-based authorization package for Meteor - compatible with built-in accounts package.

### Example App

The ```example-app``` directory contains a Meteor app which shows off the following features:
* Server-side publishing with authorization to secure sensitive data
* Client-side navigation with link visibility based on user permissions
* Page-based app with initial sign-in page using ```accounts-ui```
* Client-side routing via ```meteor-router``` smart package

See this app in action by:
  1. ```git clone https://github.com/alanning/meteor-roles.git```
  2. ```cd meteor-roles/example-app```
  3. ```mrt```
  4. point browser to ```http://localhost:3000```

### Usage

User entries in the ```Meteor.users``` collection gain a new field named ```roles``` which is an array of strings corresponding to the user's roles.

-- **Server** --

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

Client javascript has access to all the same Roles functions as the server with the addition of a ```isInRole``` handlebars helper which is automatically registered by the Roles package.  But you will only be able to take advantage of these if you publish user's 'roles' field.  It is _not_ published by default.

Like all Meteor applications, client-side checks are a convenience, rather than a true security implementation 
since Meteor bundles the same client-side code to all users.  Providing the Roles functions client-side also allows for latency compensation during Meteor method calls.

NOTE: Any sensitive data needs to be controlled server-side to prevent unwanted disclosure. To be clear, Meteor sends all templates, client-side javascript, and published data to the client's browser.  This is by design and is a good thing.  The following example is just sugar to help improve the user experience for normal users.  Those interested in seeing the the 'admin' template in the example below will still be able to do so by manually reviewing the bundled client.js file but this is not a problem as long as the actual data is restricted server-side.

```js
// client/myApp.js

Meteor.subscribe('ownUserData');

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
