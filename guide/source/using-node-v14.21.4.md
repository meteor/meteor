---
title: Using Extended Support Maintenance Node.js v14.21.4
description: How to use our ESM Node.js  version within your Meteor app.
---

Meteor 2.13 comes with Node v14.21.4 security update. If you are using Meteor with Docker,
you will need to update your Dockerfile to use our [new docker image](https://hub.docker.com/r/meteor/node)
that contains Node.js v14.21.4.


Our plan with having a Extended Support Maintenance Node.js version is to provide a stable Node.js version for Meteor
users who are not on Meteor v3.0 yet.
This will give more time to migrate apps to the latests Meteor version.

Meteor Software will offer Meteor.js Node.js 14 ESM for 12 months beyond the official end-of-life date (April 2023 - April 2024).

These updates will have a focus on security and critical bug fixes,
and will not include any new features or breaking changes,
most changes will be a cherry-pick from Node.js v16.x and running all Node.js test suites.

In a more concise quote Meteor ESM Node.js 14 will include:

- Security updates: We will actively monitor and backport security fixes from newer versions of Node.js (such as Node.js 16 and 18) to ensure the ongoing safety and stability of your Meteor.js applications running on Node.js 14.
- Critical bug fixes: We will address any critical issues that might arise, prioritizing stability and compatibility for your projects.


More information can be found in this [Forum Topic](https://forums.meteor.com/t/announcing-extended-support-maintenance-for-node-js-14/59811/11), in this [blog post](https://blog.meteor.com/announcing-extended-support-maintenance-for-node-js-14-f9e8381f8bb5) by [Fred Maia](https://github.com/fredmaiaarantes)
and in this [PR](https://github.com/meteor/node-v14-esm/pull/1) by [denihs](https://github.com/denihs), where we have all changes that were made.

The source code for this Node.js release can be seen [here](https://github.com/meteor/node-v14-esm).

If you need assistance or have any questions about using our Node.js 14 ESM build, please don’t hesitate to reach out to our team.
