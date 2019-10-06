## v2.0.1

* Wrap localStorage in try/catch to avoid crash when disabled. Port fix from v1 branch. #182

## v2.0.0

* Rewrite with the new schema for `roles` field and `Meteor.roles` collection.
* Support for roles hierarchies.
* Groups were renamed to scopes.
* Groups/scopes are always available, if you do not specify a scope, role is seen as a global role.
* `GLOBAL_GROUP` is deprecated and should not be used anymore (just do not specify a scope, or use `null`).
* `getGroupsForUser` is deprecated, `getScopesForUser` should be used instead.
* Functions which modify roles are available both on the client and server side, but should be called on the
  client side only from inside Meteor methods.
* `deleteRole` can now delete role even when in use, it is automatically unset from all users.
* Functions `addRolesToParent` and `removeRolesFromParent` were added.
* `addUsersToRoles` and `setUserRoles` now require that roles exist and will not create missing roles automatically.
* All functions work with 1.0 arguments, but in 2.0 accept extra arguments and/or options.
