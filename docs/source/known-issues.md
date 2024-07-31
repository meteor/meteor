---
title: Known issues in 2.13
description: Troubleshooting in Meteor 2.13
---

<h2 id="cannot-extract-meteor-tool">Cannot extract version of meteor tool</h2>

For some users, the `meteor update` to version 2.13 command may fail with the following error or similar:

```shell
Error: incorrect data check
    at Zlib.zlibOnError [as onerror] (zlib.js:187:17)
 => awaited here:
 ...
    at /tools/cli/main.js:1165:7 {
  errno: -3,
  code: 'Z_DATA_ERROR'
  }

```
<h3 id="the-issue"> The issue </h3>

It seems related to [our first ESM version of Node.js v14.21.4](https://github.com/meteor/node-v14-esm) and the `zlib` package.
We have been able to reproduce this issue only in Mac Intel.

You can follow along with the [GitHub issue](https://github.com/meteor/meteor/issues/12731) for updates.

<h3 id="solution"> Solution </h3>

The solution for this issue is running the following command in your terminal:

```shell

curl https://install.meteor.com/\?release\=2.13.3 | sh

```

