---
title: Migrating to Meteor 1.6
description: How to migrate your application to Meteor 1.6.
discourseTopicId: 40314
---

Most changes in Meteor 1.6 are related to the underlying Node.js upgrade .  We encourage reading [full history](http://docs.meteor.com/changelog.html) and comparing the full differences between the versions you are upgrading from and to.

> If you find details which are not covered here, please discuss it using the "Discuss" button above.  If you find any important details which are not included here, please open a pull-request to this article using the "Edit on GitHub" button above to help other members of the community!

<h2 id="older-versions">Migrating from a version older than 1.5?</h2>

If you're migrating from a version of Meteor older than Meteor 1.5, there may be important considerations not listed in this guide (which specifically covers 1.5 to 1.6).  Please review the older migration guides for details:

* [Migrating to Meteor 1.5](1.5-migration.html) (from 1.4)
* [Migrating to Meteor 1.4](1.4-migration.html) (from 1.3)
* [Migrating to Meteor 1.3](1.3-migration.html) (from 1.2)

<h3 id="node-breaking-changes">Node.js Breaking Changes</h3>

The most significant update in Meteor 1.6 is the upgrade of the underlying Node.js version which Meteor relies on.  While Meteor itself has made the appropriate changes, any core Node.js module usage within applications is subject to the breaking changes outlined by the Node.js change logs below which, when combined, cover the transition from Node.js 4 to 8:

* [Breaking changes between v4 and v6](https://github.com/nodejs/node/wiki/Breaking-changes-between-v4-LTS-and-v6-LTS).
* [Breaking changes between v6 and v7](https://github.com/nodejs/node/wiki/Breaking-changes-between-v6-and-v7).
* [Changelog for Node 8](https://github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md).
  > At the time of writing, the official "_Breaking changes between v6 and v8_" was not yet available from the Node.js Foundation.  The "Notable changes" section within this changelog is the best alternative resource.

<h4 id="node-notable">Node.js Notable Changes</h4>

While the Node.js change-logs are quite extensive, it is our experience so far that the most common change are the deprecations of the `new Buffer()` and `Buffer()` constructors. See the Node.js [`Buffer` documentation](https://nodejs.org/dist/latest-v8.x/docs/api/buffer.html#buffer_class_buffer) for more information on the correct replacements.

When reviewing the changelog, pay close attention to any items which are marked as "removed".
