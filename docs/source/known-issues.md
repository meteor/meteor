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

You can follow along with the [GitHub issue](https://github.com/meteor/meteor/issues/12731) for updates.

The workaround while our developers are working in this issue is:

running the following command in you terminal:

```shell

curl https://install.meteor.com/\?release\=2.12 | sh

```

