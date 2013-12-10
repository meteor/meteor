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
