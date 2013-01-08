meteor-roles
============

Roles-based authorization package for Meteor - compatible with built-in accounts package.

### Tests


To run tests: 
  1. install [Meteorite][1]
  2. cd 'roles' directory
  3. mrt
  4. point browser at http://localhost:3000/

_NOTE_: If you see an error message regarding **'roles package does not exist'** that means you are trying to run 'mrt' in the wrong directory.  See step 2.


### Usage

User objects now have an extra 'roles' field which contains the user's roles.

**Server:**

Add checks to publish and other sensitive functions to restrict data available to client.

Publish the logged-in user's roles like so:
```js
// Give Users access to their own roles
Meteor.publish('ownUserData', function () {
  var user = Meteor.users.findOne(this.userId),
      fields = {roles:1}

  return Meteor.users.find({_id:this.userId}, {fields: fields})
})
```

**Client:**

```js
Meteor.subscribe('ownUserData')

Template.header.isInRole = function (role) {
  var user = Meteor.user()

  if (!user) return false

  return _.contains(user.roles, role)
}
```
```handlebars
// HTML template
{{#if isInRole 'admin'}}
  ... stuff only admins care about.  
  ... note: anything published will be sent to the client, so lock it down server-side first
{{/if}}
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





[1]: https://github.com/oortcloud/meteorite "Meteorite"

[2]: http://yui.github.com/yuidoc/ "YUIDoc"
