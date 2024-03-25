---
title: Extended Support Maintenance for Node.js
description: How to use our ESM Node.js version within your Meteor app.
---

Meteor Software will offer Extended Support Maintenance for Node.js 14 for 12 months beyond the official end-of-life date (April 2023 - April 2024).
With the release of Meteor 2.13, we also introduced [our first ESM version of Node.js v14.21.4](https://github.com/meteor/node-v14-esm), incorporating security updates.

Our plan for Extended Support Maintenance of Node.js is to provide a stable environment for Meteor users until the launch of Meteor 3.0, which will be compatible with Node.js 18. This extended support period will give users more time to upgrade their apps to the latest version of Meteor.

Updates for Node.js will primarily focus on security and critical bug fixes, with no new features or breaking changes included. Most changes will be cherry-picked from Node.js v16.x, and to ensure proper functioning, we will run both Node.js and Meteor.js test suites.

In summary, ESM Node.js 14 will include:

- Security updates: We will actively monitor and backport security fixes from Node.js (including Node.js 16 and 18) to ensure the ongoing safety and stability of your Meteor.js apps running on Node.js 14.
- Critical bug fixes: We will address any critical issues that arise, prioritizing stability and compatibility.

<h2 id="download">Download Node.js ESM 14</h2>

If you need to download Node.js ESM 14 or use it in your CI process, you can use the following links:

- [Linux x64](https://static.meteor.com/dev-bundle-node-os/v14.21.4/node-v14.21.4-linux-x64.tar.gz)
- [MacOs x64](https://static.meteor.com/dev-bundle-node-os/v14.21.4/node-v14.21.4-darwin-x64.tar.gz)
- [MacOs ARM](https://static.meteor.com/dev-bundle-node-os/v14.21.4/node_Darwin_arm64_v14.21.4.tar.gz)
- [Windows x64](https://static.meteor.com/dev-bundle-node-os/v14.21.4/node-v14.21.4-win-x64.7z)

<h2 id="docker">Docker Images</h2>

Meteor Cloud users who utilize our [default base image for Galaxy](https://hub.docker.com/r/meteor/galaxy-app/tags) do not need to make any changes. We have made all the necessary adjustments internally so that you can concentrate on developing your app without worrying about infrastructure.

If you are using Meteor with Docker in another service, you will need to update your Dockerfile to utilize one of our updated Docker images that includes Node.js ESM v14.21.4. Alternatively, you can modify your image to ensure that the security updates are applied.

You can find our official Docker images at the following links:

- [meteor/node](https://hub.docker.com/r/meteor/node/tags)
- [meteor/galaxy-app](https://hub.docker.com/r/meteor/galaxy-app/tags)
- [meteor/galaxy-puppeteer](https://hub.docker.com/r/meteor/galaxy-puppeteer/tags)
- [meteor/base](https://hub.docker.com/r/meteor/meteor-base/tags)

<h2 id="installing-node-in-linux"> Installing Node.js in Linux</h2>

In case you are using a Linux x64 OS and you installed Node.js using the package manager or NVM, you
will need this [bash script](https://gist.github.com/Grubba27/890609247e020de23659570ddeb326b2)
to ensure that the Node.js version installed on the machine is the same as provided by Meteor.

```bash

#!/bin/bash

# Set environment variables
NODE_VERSION="14.21.4"
NODE_URL="https://static.meteor.com/dev-bundle-node-os/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz"
DIR_NODE="/usr/local"

# Download and install Node.js using wget
wget -qO- "$NODE_URL" | tar -xz -C "$DIR_NODE"/ && mv "$DIR_NODE"/node-v${NODE_VERSION}-linux-x64 "$DIR_NODE"/v$NODE_VERSION

# Add node and npm to the PATH so the commands are available
export NODE_PATH="$DIR_NODE/v$NODE_VERSION/lib/node_modules"
export PATH="$DIR_NODE/v$NODE_VERSION/bin:$PATH"

# Confirm the installation
node -v
npm -v

```

<h2 id="versions">Node.js ESM Versions and Repository</h2>

The currently available version is `v14.21.4`.

The source code for our Node.js ESM release can be viewed [on our forked repository](https://github.com/meteor/node-v14-esm).

<h2 id="additional-info">Additional Information</h2>

More information can be found in [this post published](https://forums.meteor.com/t/announcing-extended-support-maintenance-for-node-js-14/59811/11) on our forum, in the [official announcement on our blog](https://blog.meteor.com/announcing-extended-support-maintenance-for-node-js-14-f9e8381f8bb5), and you can check the [GitHub PR](https://github.com/meteor/node-v14-esm/pull/1) where we have made all the changes.

If you need assistance or have any questions about using our Node.js 14 ESM build, please do not hesitate to reach out to our team.
