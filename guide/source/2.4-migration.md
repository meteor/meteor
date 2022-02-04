---
title: Migrating to Meteor 2.4
description: How to migrate your application to Meteor 2.4.
---

Most of the new features in Meteor 2.4 are either applied directly behind the scenes (in a backwards compatible manner) or are opt-in. For a complete breakdown of the changes, please refer to the [changelog](http://docs.meteor.com/changelog.html).

The above being said, there are a few items that you should implement to have easier time in the future.

<h3 id="createIndex">createIndex</h3>

Previously undocumented `_ensureIndex` has been aligned with MongoDB breaking change in naming and is now usable as `createIndex`. Use of `_ensureIndex` is now deprecated and will throw a warning in development for you.

<h3 id="email22">Email 2.2</h3>

The `email` package had a feature update. You can now override the sending functionality completely with `Email.customTransport` or if you are using [known services](https://nodemailer.com/smtp/well-known/) you can now ditch the `MAIL_URL` environment variable and set it in your `settings.json` file, like so:
```json
{
  "packages": {
    "email": {
      "service": "Mailgun",
      "user": "postmaster@meteor.com",
      "password": "superDuperPassword"
    }
  }
}
```

<h2 id="older-versions">Migrating from a version older than 2.3?</h2>

If you're migrating from a version of Meteor older than Meteor 2.3, there may be important considerations not listed in this guide (which specifically covers 2.2 to 2.3). Please review the older migration guides for details:

* [Migrating to Meteor 2.3](2.3-migration.html) (from 2.2)
* [Migrating to Meteor 2.2](2.2-migration.html) (from 2.0)
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
