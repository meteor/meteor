# Changelog

## v3.6.3

* Added missing dependency on the `ddp` package [@storytellercz](https://github.com/sponsors/StorytellerCZ)
* Updated Blaze weak dependency to v2.9 [@storytellercz](https://github.com/sponsors/StorytellerCZ)

## v3.6.2

* Fixed TypeScript definition to play nice with Meteor definition [#389](https://github.com/Meteor-Community-Packages/meteor-roles/pull/389) [@bruceborrett](https://github.com/sponsors/bruceborrett)

## v3.6.1

* Added types for async functions [#386](https://github.com/Meteor-Community-Packages/meteor-roles/pull/386) [@storytellercz](https://github.com/sponsors/StorytellerCZ)
* Updated docs with async functions [@storytellercz](https://github.com/sponsors/StorytellerCZ)
* Updated `zodern:types` to v1.0.11

## v3.6.0

* Added async versions of functions [#361](https://github.com/Meteor-Community-Packages/meteor-roles/pull/361) [#378](https://github.com/Meteor-Community-Packages/meteor-roles/pull/378) [@bratelefant](https://github.com/bratelefant) [@storytellercz](https://github.com/sponsors/StorytellerCZ) [@jankapunkt](https://github.com/sponsors/jankapunkt)
* Added missing types [#383](https://github.com/Meteor-Community-Packages/meteor-roles/pull/383) [@storytellercz](https://github.com/sponsors/StorytellerCZ)
* Add complete test suite [#375](https://github.com/Meteor-Community-Packages/meteor-roles/pull/375) [@jankapunkt](https://github.com/sponsors/jankapunkt) [#380](https://github.com/Meteor-Community-Packages/meteor-roles/pull/380) [@bratelefant](https://github.com/bratelefant)

## v3.5.1

* Fix for index creation functions losing context [#371](https://github.com/Meteor-Community-Packages/meteor-roles/pull/371) [@copleykj](https://github.com/sponsors/copleykj)

## v3.5.0

* Bump `blaze` weak dependency to v2.7.1
* Bring types to the core and update them [#365](https://github.com/Meteor-Community-Packages/meteor-roles/pull/365) [@storytellercz](https://github.com/sponsors/StorytellerCZ)
* If you use Meteor 2.8+ indexes are now created using the new async method [#366](https://github.com/Meteor-Community-Packages/meteor-roles/pull/366) [@storytellercz](https://github.com/sponsors/StorytellerCZ)

## v3.4.0

* Use the new `createIndex` instead of `_ensureIndex` if available

## v3.3.0

* Update dependencies
* Made compatible with Meteor 2.3

## v3.2.3

* Update dependencies
* Update roles_common.js jsdoc documentation [#321](https://github.com/Meteor-Community-Packages/meteor-roles/pull/321)([@kulttuuri](https://github.com/kulttuuri))
* Function `userIsInRole` should return false if a function is given as user [#324](https://github.com/Meteor-Community-Packages/meteor-roles/pull/324)([@Floriferous](https://github.com/Floriferous))

## v3.2.2

* Fixed fails like `rev.push is not a function` and `number 1 is not iterable (cannot read property Symbol(Symbol.iterator))` calling `Roles.getRolesForUser()`

## v3.2.1_1

* Republish without dev-dependencies

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
