---
title: Migrating to Meteor 1.9.3
description: How to migrate your application to Meteor 1.9.3.
---

Most of the new features in Meteor 1.9.3 are either applied directly behind the scenes (in a backwards compatible manner) or are opt-in. For a complete breakdown of the changes, please refer to the [changelog](http://docs.meteor.com/changelog.html).

The above being said, there is a fix to an error that you might get to note.

<h3 id="mongo-retry-writers">MongoError unsupported retryable writes</h3>

If you get the error `MongoError: This MongoDB deployment does not support retryable writes. Please add retryWrites=false to your connection string.`, append `retryWrites=false` to your MongoDB connection string.

<h2 id="older-versions">Migrating from a version older than 1.9?</h2>

If you're migrating from a version of Meteor older than Meteor 1.9, there may be important considerations not listed in this guide (which specifically covers 1.9 to 1.9.3). Please review the older migration guides for details:

* [Migrating to Meteor 1.8.2](1.9-migration.html) (from 1.8.3)
* [Migrating to Meteor 1.8.3](1.8.3-migration.html) (from 1.8.2)
* [Migrating to Meteor 1.8.2](1.8.2-migration.html) (from 1.8)
* [Migrating to Meteor 1.8](1.8-migration.html) (from 1.7)
* [Migrating to Meteor 1.7](1.7-migration.html) (from 1.6)
* [Migrating to Meteor 1.6](1.6-migration.html) (from 1.5)
* [Migrating to Meteor 1.5](1.5-migration.html) (from 1.4)
* [Migrating to Meteor 1.4](1.4-migration.html) (from 1.3)
* [Migrating to Meteor 1.3](1.3-migration.html) (from 1.2)
