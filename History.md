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

## v1.2.14

* Compatibility with Meteor 1.2. #133
* Pass options through to getUsersInRole. #77
* Fix formatting and punctuation in readme. #118
* Use named publish func so clients can check when ready(). #88
* Only support Meteor v1.2+ going forward; Older package versions
  will remain available.


## v1.2.13

* Specific release just for bug in Meteor 0.9.1 [1].  #53

  Note: Supporting both 0.9.0 and 0.9.1 with the same code base is not
  possible [2] so this version only supports Meteor <0.9.0 and 0.9.1+;
  not 0.9.0 or 0.9.0.1.  Users of 0.9.0 will still use v1.2.12 which has
  no functional differences.

  1. https://github.com/meteor/meteor/issues/2521#issuecomment-54702099
  2. https://github.com/meteor/meteor/issues/2531


## v1.2.12

* Support Meteor 0.9.0 - new packaging system (hopefully). #52


## v1.2.11

* Add `getGroupsForUser` function. #39


## v1.2.10

* Fix behavior for groups with more than one period in their name. #44


## v1.2.9

* Let `meteor test-packages ./roles` work outside of an actual meteor app. #43


## v1.2.8

* Bump version number since Atmosphere only supports 3 levels


## v1.2.7.1

* Remove debug logging related to Blaze support


## v1.2.7


* Add support for Blaze UI (Meteor 0.8.0+)!  The 'roles' package must
  come after 'ui' or 'standard-app-packages' in '.meteor/packages' 
  for the 'isInRole' helper to be registered.


## v1.2.6

* Add descriptive error msg when group name starts with $
* Auto-convert periods in group names to underscores


## v1.2.5

* Add setUserRoles function
* Support passing user object for Roles.addUsersToRoles
* Support passing user object for Roles.removeUsersFromRoles


## v1.2.4

* Update getRolesForUser to not return null when group is specified but user has no permissions


## v1.2.3

* Support using group in 'isInRole' client handlebars helper. 
  Contributed by [@pascoual](https://github.com/pascoual)


## v1.2.2

* Support passing user object in addition to _id for Roles.getRolesForUser


## v1.2.1

* Improve internal string value of Roles.GLOBAL_GROUP constant


## v1.2.0

* Use constant property Roles.GLOBAL_GROUP instead of hard-coded string to 
  assign blanket roles/permissions for a user
* Check Roles.GLOBAL_GROUP even if no group specified.  This does not affect 
  normal usage but provides a convenient short-hand for group users:
    Roles.addUsersToRoles(user, 'admin', Roles.GLOBAL_GROUP)
    Roles.userIsInRole(user, 'admin') => true
* Expand test coverage


## v1.1.1

* Add support for global group which provides blanket roles/permissions across all groups for that user
* Update Roles.getUsersInRole to accept an array of roles


## v1.1.0

* Add support for per-group roles
* Fix for Issue #12 - Roles.userIsInRole returns whole user record
  This is a breaking change for code that relied on the undocumented (and incorrect) behavior!


## v1.0.6

* Add compatibility with Meteor 0.6.5 package system
* Bug fix for Issue #11 - deleteRole by _id, not name for untrusted code. Contributed by [@nickmoylan](https://github.com/nickmoylan)


## v1.0.5

* Fix for Issue #5 - error adding role for single user. Contributed by [@mcrider](https://github.com/mcrider)
* Get tests working under Meteor 0.6.0


## v1.0.4

* Remove need for client subscribe by using 'null' publish


## v1.0.3

* Fix for Issue #3 - conflict with spiderable package


## v1.0.2

* Murky, ancient history
