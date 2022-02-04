---
title: Migrating to Meteor 2.2
description: How to migrate your application to Meteor 2.2.
---

Most of the new features in Meteor 2.2 are either applied directly behind the scenes (in a backwards compatible manner) or are opt-in. For a complete breakdown of the changes, please refer to the [changelog](http://docs.meteor.com/changelog.html).

The above being said, there are a few breaking changes that you might need to apply migration for.

<h3 id="mongodb-windows">Running MongoDB on Windows</h3>

`meteor-tool` has been updated and you might need to install the new Visual C++ Redistributable for Visual Studio 2019 to run MongoDB 4.4.4 on Windows. [read more](https://docs.meteor.com/windows.html)

<h3 id="mongodb-useUnifiedTopology">MongoDB `useUnifiedTopology`</h3>

`mongo` package is now using `useUnifiedTopology` as `true` by default otherwise the new driver was producing a warning (see details below). It's important to test your app with this change.

<h3 id="cordova-10">Cordova 10</h3>

`cordova` plugins and main libraries were updated from 9 to 10. It's important to test your app with these changes.

<h3 id="typescript-4.2.2">Typescript 4.2.2</h3>

`typescript` was updated to 4.2.2, make sure your read the [breaking changes](https://devblogs.microsoft.com/typescript/announcing-typescript-4-2/#breaking-changes).

<h2 id="older-versions">Migrating from a version older than 2.0?</h2>

If you're migrating from a version of Meteor older than Meteor 2.0, there may be important considerations not listed in this guide (which specifically covers 2.0 to 2.2). Please review the older migration guides for details:

* [Migrating to Meteor 2.0](2.0-migration.html) (from 1.12)
* [Migrating to Meteor 1.12](1.12-migration.html) (from 1.11)
* [Migrating to Meteor 1.11](1.11-migration.html) (from 1.10.2)
* [Migrating to Meteor 1.10.2](1.10.2-migration.html) (from 1.10)
* [Migrating to Meteor 1.10](1.10-migration.html) (from 1.9.3)
* [Migrating to Meteor 1.9.3](1.9.3-migration.html) (from 1.9)
* [Migrating to Meteor 1.9](1.9-migration.html) (from 1.8.3)
* [Migrating to Meteor 1.8.3](1.8.3-migration.html) (from 1.8.2)
* [Migrating to Meteor 1.8.2](1.8.2-migration.html) (from 1.8)
* [Migrating to Meteor 1.8](1.8-migration.html) (from 1.7)
* [Migrating to Meteor 1.7](1.7-migration.html) (from 1.6)
* [Migrating to Meteor 1.6](1.6-migration.html) (from 1.5)
* [Migrating to Meteor 1.5](1.5-migration.html) (from 1.4)
* [Migrating to Meteor 1.4](1.4-migration.html) (from 1.3)
* [Migrating to Meteor 1.3](1.3-migration.html) (from 1.2)
