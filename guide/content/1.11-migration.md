---
title: Migrating to Meteor 1.11
description: How to migrate your application to Meteor 1.11.
---

Most of the new features in Meteor 1.11 are either applied directly behind the scenes (in a backwards compatible manner) or are opt-in. For a complete breakdown of the changes, please refer to the [changelog](http://docs.meteor.com/changelog.html).

The above being said, there some breaking changes to note and migration steps for a bug that you might encounter.

<h3 id="eamil-dns">Email DNS lookup</h3>

`email` package dependencies have been update and package version has been bumped to 2.0.0
There is a potential breaking change as the underlying package started to use `dns.resolve()`
instead of `dns.lookup()` which might be breaking on some environments.
See [nodemailer changelog](https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md) for more information.

<h3 id="cordova-git-url">Cordova now working with Git urls</h3>

Cordova add plugin is not working with plugin name in the git URL when the plugin id was different than the name in the config.xml.

<h2 id="older-versions">Migrating from a version older than 1.10.2?</h2>

If you're migrating from a version of Meteor older than Meteor 1.10.2, there may be important considerations not listed in this guide (which specifically covers 1.10.2 to 1.11). Please review the older migration guides for details:

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
