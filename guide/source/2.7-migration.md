---
title: Migrating to Meteor 2.7
description: How to migrate your application to Meteor 2.7.
---

Meteor `2.7` introduce the new `accounts-2fa` package, support for TailwindCSS 3.x, and built-in support for PostCSS in `standard-minifier-css`. For a complete breakdown of the changes, please refer to the [changelog](http://docs.meteor.com/changelog.html).

The above being said, there are a few items that you should do to have the latest CSS minifier in your project.

<h3 id="new-css-minifier">Update meteor-node-stubs</h3>

As we added support for [node:](https://nodejs.org/api/esm.html#node-imports) imports, you need to 
update `meteor-node-stubs` to version `1.2.1`:

```bash
meteor npm install meteor-node-stubs@1.2.1
```

<h3 id="new-css-minifier">Support for PostCSS</h3>

Starting from this version of Meteor (and 1.8.0 of `standard-minifier-css`), Meteor will run PostCSS plugins if you have them configured. If you are using `juliancwirko:postcss` as your css minifier, it is recommended to migrate to using `standard-minifier-css`. For most apps, this will only requiring switching which minifier the app uses:

```bash
meteor remove juliancwirko:postcss
meteor add standard-minifier-css
```

There are two differences with `juliancwirko:postcss`:

- The `excludedPackages` PostCSS option was renamed to `excludedMeteorPackages`
- Files with the `.import.css` extension are not treated specially

> Note: In beta.1 of Meteor 2.7 we had added a new core package `minifier-css-postcss` but later decided to unify everything inside `standard-minifier-css`. So you shouldn't use `minifier-css-postcss`.

<h3 id="tailwind-css">TailwindCSS 3.x</h3>

Improvements in Meteor 2.7 enables minifiers to support TailwindCSS 3.x. These minifiers have been updated and tested with TailwindCSS 3:

- `juliancwirko:postcss`, starting with version `2.1.0`
- `standard-minifier-css`

If updating from an older version of TailwindCSS to version 3, please read the [Tailwind Official migration guide](https://tailwindcss.com/docs/upgrade-guide) to make sure you had applied the changes required by TailwindCSS itself.

<h3 id="2fa">Accounts 2FA</h3>

`accounts-2fa` is a new package that enables two-factor authentication for `accounts-password` and `accounts-passwordless`. 

There are no required changes to your application in any case, but if you want to provide 2FA for your users, and you are already using `accounts-password` or `accounts-passwordless` you can start using the new functions provided from 2FA package, read more in the [docs](https://docs.meteor.com/packages/accounts-2fa.html). 

<h2 id="older-versions">Migrating from a version older than 2.7?</h2>

If you're migrating from a version of Meteor older than Meteor 2.7, there may be important considerations not listed in this guide. Please review the older migration guides for details:

* [Migrating to Meteor 2.6](2.6-migration.html) (from 2.5)
* [Migrating to Meteor 2.5](2.5-migration.html) (from 2.4)
* [Migrating to Meteor 2.4](2.4-migration.html) (from 2.3)
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
