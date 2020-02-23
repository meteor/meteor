## v3.2.1

* `Roles.getRolesForUser()` should not fail during a call of `Roles.addUsersToRoles()` [#311](https://github.com/Meteor-Community-Packages/meteor-roles/pull/311) ([@ggerber](https://github.com/ggerber))

## v3.2.0

* New option `onlyScope` on getUsersInRole() returning only users having this role in a scoped assignment [#298](https://github.com/Meteor-Community-Packages/meteor-roles/pull/298)

## v3.1.0

* Allow setUserRoles() to replace the roles of all scopes [#294](https://github.com/Meteor-Community-Packages/meteor-roles/pull/294)

## v3.0.0

* Role assignments have been moved from the `users` documents to a separate collection called `role-assignment`, available at `Meteor.roleAssignment`.
* Role assignments are not published automatically. If you want all your role-assignments to be published automatically please include the following code:
```js
Meteor.publish(null, function () {
  if (this.userId) {
    return Meteor.roleAssignment.find({ 'user._id': this.userId });
  } else {
    this.ready()
  }
})
```
* [BC] The behavior of `getRolesForUser()` used with the option `fullObjects` changed. [In case you need the old behavior ...](https://github.com/Meteor-Community-Packages/meteor-roles/pull/276/commits/41d2ed493852f21cf508b5b0b76e4f8a09ae8f5c#diff-b2ab7f7879884835e55802c6a35ee27e)
* Added option `anyScope` to `removeUsersFromRoles()`
* Add option `onlyScoped` to `getRolesForUser()` to allow limiting the result to only scoped permissions
* All functions (excepted for those listed above) work with 2.x arguments, but in 3.x accept extra arguments and/or options.
* Details and reasoning can be found in [#276](https://github.com/Meteor-Community-Packages/meteor-roles/pull/276)
