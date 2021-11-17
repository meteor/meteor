---
title: Migrating to Meteor 1.8.2
description: How to migrate your application to Meteor 1.8.2.
---

Most of the new features in Meteor 1.8.2 are either applied directly behind the scenes (in a backwards compatible manner) or are opt-in. For a complete breakdown of the changes, please refer to the [changelog](http://docs.meteor.com/changelog.html).

The above being said, there are required migration steps that you should perform for this release to run smoothly.

<h3 id="babel-update">Update the `@babel/runtime`</h3>

Be sure to update the `@babel/runtime` npm package to its latest version
(currently 7.7.2):

```sh
meteor npm install @babel/runtime@latest
```

<h3 id="meteor-node-stubs">Meteor Node Stubs</h3>

New Meteor applications now depend on `meteor-node-stubs@1.0.0`, so it
may be a good idea to update to the same major version:

```sh
meteor npm install meteor-node-stubs@next
```

<h3 id="packages-republish">Packages should be re-published</h3>

If you are the author of any Meteor packages, and you encounter errors
when using those packages in a Meteor 1.8.2 application (for example,
`module.watch` being undefined), we recommend that you bump the minor
version of your package and republish it using Meteor 1.8.2, so
Meteor 1.8.2 applications will automatically use the new version of the
package, as compiled by Meteor 1.8.2:

```sh
cd path/to/your/package
# Add api.versionsFrom("1.8.2") to Package.onUse in package.js...
meteor --release 1.8.2 publish
```

This may not be necessary for all packages, especially those that have
been recently republished using Meteor 1.8.1, or local packages in the
`packages/` directory (which are always recompiled from source).
However, republishing packages is a general solution to a wide variety
of package versioning and compilation problems, and package authors can
make their users' lives easier by handling these issues proactively.

<h2 id="older-versions">Migrating from a version older than 1.8?</h2>

If you're migrating from a version of Meteor older than Meteor 1.8, there may be important considerations not listed in this guide (which specifically covers 1.8 to 1.8.2). Please review the older migration guides for details:

* [Migrating to Meteor 1.8](1.8-migration.html) (from 1.7)
* [Migrating to Meteor 1.7](1.7-migration.html) (from 1.6)
* [Migrating to Meteor 1.6](1.6-migration.html) (from 1.5)
* [Migrating to Meteor 1.5](1.5-migration.html) (from 1.4)
* [Migrating to Meteor 1.4](1.4-migration.html) (from 1.3)
* [Migrating to Meteor 1.3](1.3-migration.html) (from 1.2)
