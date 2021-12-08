---
title: Migrating to Meteor 1.12
description: How to migrate your application to Meteor 1.12.
---

Most of the new features in Meteor 1.12 are either applied directly behind the scenes (in a backwards compatible manner) or are opt-in. For a complete breakdown of the changes, please refer to the [changelog](http://docs.meteor.com/changelog.html).

The above being said, there are some breaking changes to note.

<h3 id="types-imports">Importing types</h3>

When importing types in Typescript, you might need to use the "type" qualifier, like so:
```js
import { Point } from 'react-easy-crop/types';
```
to
```ts
import type { Point } from 'react-easy-crop/types';
```
Because now `emitDecoratorsMetadata` is enabled.

<h3 id="typescript-upgrade">Typescript upgraded to 4.1.2</h3>

Refer to typescript breaking changes before migrating your existing project, from 3.7.6 to 4.1.2: https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes

<h2 id="older-versions">Migrating from a version older than 1.11?</h2>

If you're migrating from a version of Meteor older than Meteor 1.11, there may be important considerations not listed in this guide (which specifically covers 1.11 to 1.12). Please review the older migration guides for details:

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
