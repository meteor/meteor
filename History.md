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
