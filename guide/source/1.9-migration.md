---
title: Migrating to Meteor 1.9
description: How to migrate your application to Meteor 1.9.
---

Most of the new features in Meteor 1.9 are either applied directly behind the scenes (in a backwards compatible manner) or are opt-in. For a complete breakdown of the changes, please refer to the [changelog](http://docs.meteor.com/changelog.html).

The above being said, there is a major breaking change that you should note.

<h3 id="no-32bit-version">Discontinuation of 32-bit Unix versions</h3>

Because Node.js 12 no longer supports 32-bit Linux, Meteor 1.9 has also
dropped support for 32-bit Linux. In other words, Meteor 1.9 supports
64-bit Mac, Windows, and Linux, as well as 32-bit Windows.

<h2 id="older-versions">Migrating from a version older than 1.8.3?</h2>

If you're migrating from a version of Meteor older than Meteor 1.8.3, there may be important considerations not listed in this guide (which specifically covers 1.8.3 to 1.9). Please review the older migration guides for details:

* [Migrating to Meteor 1.8.3](1.8.3-migration.html) (from 1.8.2)
* [Migrating to Meteor 1.8.2](1.8.2-migration.html) (from 1.8)
* [Migrating to Meteor 1.8](1.8-migration.html) (from 1.7)
* [Migrating to Meteor 1.7](1.7-migration.html) (from 1.6)
* [Migrating to Meteor 1.6](1.6-migration.html) (from 1.5)
* [Migrating to Meteor 1.5](1.5-migration.html) (from 1.4)
* [Migrating to Meteor 1.4](1.4-migration.html) (from 1.3)
* [Migrating to Meteor 1.3](1.3-migration.html) (from 1.2)
