# Meteor 3.0 Migration Guide

:::info You are reading the migration guide for Meteor 3!

This is a live document which will be updated as development progresses.
:::

This guide is for users with Meteor 2.x projects understand the changes between Meteor 2.x and Meteor 3.0. It's not required to read this guide before starting with Meteor 3.0. To learn Meteor 3.0, we recommend reading the [new documentation](https://v3-docs.meteor.com).

## What's the status of version 3.0?

Meteor 3.0 is currently in its official version!

**Latest version:** `3.0.4` <br/>
**Node.js version:** `20.18.0 LTS` <br/>
**NPM version:** `10.8.2`

## How to try Meteor 3.0?

You can create a new Meteor 3.0 project by running the command below:

```bash
meteor create my-new-project --release 3.0.4
```

## How to upgrade from Meteor 2.x?

You can upgrade your Meteor 2.x project by running the command below inside your project folder:

```bash
meteor update --release 3.0.4
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

- [Frequently Asked Questions](./frequently-asked-questions/index.md), answers to common questions.
- [Breaking Changes](./breaking-changes/index.md), an overview of the changes that will affect your application.
  - [Meteor.call x Meteor.callAsync](./breaking-changes/call-x-callAsync.md), why should you change your methods to use `Async` methods.
  - [Upgrading packages](./breaking-changes/upgrading-packages.md), how to upgrade your packages to the be compatible with Meteor v3.

- [How async functions work and how to use them](./api/async-functions.md), a how-to guide in how to use async functions and helpers for Meteor.
- [Renamed Functions](./api/renamed-functions.md), a list of functions that were renamed in Meteor v3.
- [Removed Functions](./api/removed-functions.md), a list of functions that were removed in Meteor v3.

- [React in Meteor v3](./front-end/react.md), how to migrate your React code to Meteor v3.
- [Blaze in Meteor v3](./front-end/blaze.md), how to migrate your Blaze code to Meteor v3.

- [Migrating to Async in Meteor 2.x](migrating-to-async-in-v2/index.md), how can you migrate your application to Meteor v3 while in 2.x.

## External Resources

We are aware of these articles and guides to assist with your migration:

 - [Prepare your Meteor.js project for the big 3.0 release](https://dev.to/jankapunkt/prepare-your-meteorjs-project-for-the-big-30-release-14bf)
 - [Gradually upgrading a Meteor.js project to 3.0](https://dev.to/meteor/gradually-upgrading-a-meteorjs-project-to-30-5aj0)
 - [Meteor 3.0 Migration Guide, from Daniel](https://docs.google.com/document/d/1XxHE5MQaS0-85HQ-bkiXxmGlYi41ggkX3F-9Rjb9HhE/edit#heading=h.65xi3waq9bb)
 - [Illustreets Migration Guide, large SaaS migrated to 3.0](https://forums.meteor.com/t/large-saas-migrated-to-3-0/61113) & their how-to [post](https://forums.meteor.com/t/meteor-3-0-beta-6-is-out/61277/12)
 
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
