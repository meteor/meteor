# Meteor 3.0 Migration Guide

:::info You are reading the migration guide for Meteor 3!

This is a live document which will be updated as development progresses.
:::

This guide is for users with Meteor 2.x projects understand the changes between Meteor 2.x and Meteor 3.0. It's not required to read this guide before starting with Meteor 3.0. To learn Meteor 3.0, we recommend reading the [new documentation](https://v3-docs.meteor.com).

## What's the status of version 3.0?

Meteor 3.0 is currently in its official version. [Check the documentation for the latest version information.](https://docs.meteor.com/)

## How to try Meteor 3.0?

You can install the latest Meteor version command below:

```bash-vue
  npx meteor
```

and to create a new Meteor project:

```bash-vue
  meteor create
```

This will prompt the project creator wizard to help you set up a new project.

## How to upgrade from Meteor 2.x?

You can upgrade your Meteor 2.x project by running the command below inside your project folder:

```bash-vue
meteor update
meteor reset # resets project to a fresh state
```

If you are upgrade from an older version of Meteor, you might have a different MongoDB driver version. If you encounter issues, consider clearing the local database.

```bash
meteor reset --db # resets local db
```

Also, it's a good idea to completely remove `node_modules` and the `package-lock.json` before running `meteor npm install`:

```bash
rm -rf node_modules package-lock.json
meteor npm install
```

Which will install the necessary packages using the latest Node.js version from Meteor 3.

## What this guide will cover?

This guide covers the necessary topics for migrating your application from Meteor 2.x to Meteor 3.0, including:

- [Migration Strategy](./guide/migration-strategy.md), a recommended step-by-step migration order based on real-world experience.
- [Frequently Asked Questions](./frequently-asked-questions/index.md), answers to common questions.
- [Breaking Changes](./breaking-changes/index.md), an overview of the changes that will affect your application.

  - [Meteor.call x Meteor.callAsync](./breaking-changes/call-x-callAsync.md), why should you change your methods to use `Async` methods.
  - [Upgrading packages](./breaking-changes/upgrading-packages.md), how to upgrade your packages to the be compatible with Meteor v3.

- [Package Replacements](./guide/package-replacements.md), common unmaintained packages and their Meteor 3-compatible alternatives.
- [Removing Fibers Patterns](./guide/removing-fibers.md), before/after examples for replacing Fibers-dependent code.
- [How async functions work and how to use them](./api/async-functions.md), a how-to guide in how to use async functions and helpers for Meteor.
- [Renamed Functions](./api/renamed-functions.md), a list of functions that were renamed in Meteor v3.
- [Removed Functions](./api/removed-functions.md), a list of functions that were removed in Meteor v3.

- [React in Meteor v3](./front-end/react.md), how to migrate your React code to Meteor v3.
- [Blaze in Meteor v3](./front-end/blaze.md), how to migrate your Blaze code to Meteor v3.

- [Migrating to Async in Meteor 2.x](migrating-to-async-in-v2/index.md), how can you migrate your application to Meteor v3 while in 2.x.
- [Common Errors](./guide/common-errors.md), documented errors and solutions you may encounter during migration.

## Migration Reports and External Resources

We are aware of these migration reports, articles, guides, and videos to assist with your migration:

- [Prepare your Meteor.js project for the big 3.0 release](https://dev.to/jankapunkt/prepare-your-meteorjs-project-for-the-big-30-release-14bf)
- [Gradually upgrading a Meteor.js project to 3.0](https://dev.to/meteor/gradually-upgrading-a-meteorjs-project-to-30-5aj0)
- [Meteor 3.0 Migration Guide, from Daniel](https://docs.google.com/document/d/1XxHE5MQaS0-85HQ-bkiXxmGlYi41ggkX3F-9Rjb9HhE/edit#heading=h.65xi3waq9bb)
- [Illustreets Migration Guide, large SaaS migrated to 3.0](https://forums.meteor.com/t/large-saas-migrated-to-3-0/61113) & their how-to [post](https://forums.meteor.com/t/meteor-3-0-beta-6-is-out/61277/12)
- [Atmosphere Migration from Meteor 2.x to Meteor 3.4 with Rspack](https://blog.galaxycloud.app/meteorjs-2-to-3-blaze-migration-rspack/)
- [The Meteor 3.0 Migration: A Space Exploration Mission](https://dev.to/meteor/the-meteor-30-migration-a-space-exploration-mission-3gb5) — Collection2, collection-hooks, SCSS, Cordova migration experience
- Dev Diary series by Harry Adel: [#24](https://harryadel.com/dev-diary-24/) (package audit & strategy), [#25](https://harryadel.com/dev-diary-25/) (auth packages & Fibers removal), [#26](https://harryadel.com/dev-diary-26/) (app restructuring & final migration)
- [WeKan Meteor 3 Migration PR](https://github.com/wekan/wekan/pull/6205) — large Blaze app migration with 23 model files
- [Wework Meteor 3.4 Migration PR](https://github.com/nate-strauser/wework/pull/126) — iron:router replacement, REST API migration
- [Community Package Migration Thread](https://forums.meteor.com/t/looking-for-help-migrating-packages-to-meteor-3-0/60985) — ongoing community discussion and tracking
- [Package Compatibility Spreadsheet](https://docs.google.com/spreadsheets/d/1JbUZmJab3owZ9LV71Ubto32YX_QWQljRypJTOQupxL8/edit?usp=sharing) — collaborative tracking of package compatibility

### Videos

Migrating apps to Meteor 3.0:

- TicTacToe & others: [YouTube](https://www.youtube.com/watch?v=MtStd0aeyQA)
- Complex Svelte todo list & others: [YouTube](https://www.youtube.com/watch?v=-XW8xwSk-zU)
- Meteor University with v3
  - part 1: [YouTube](https://www.youtube.com/watch?v=WbwHv-aoGlU)
  - part 2: [YouTube](https://www.youtube.com/watch?v=PB2M16fmloM)
  - part 3: [YouTube](https://www.youtube.com/watch?v=79ytCgZQfSU)
  - part 4: [YouTube](https://www.youtube.com/watch?v=InNCy0duKak)

---

If you have a migration guide, either in video or text format, please share it with us to include here.
