# <a href='https://www.meteor.com'><img src='https://user-images.githubusercontent.com/841294/26841702-0902bbee-4af3-11e7-9805-0618da66a246.png' height='60' alt='Meteor'></a>

[![TravisCI Status](https://travis-ci.org/meteor/meteor.svg?branch=devel)](https://travis-ci.org/meteor/meteor)
[![CircleCI Status](https://circleci.com/gh/meteor/meteor/tree/devel.svg?style=shield&circle-token=c2d3c041506bd493ef3795ffa4448684cfce97b8)](https://circleci.com/gh/meteor/meteor/tree/devel)

Meteor is an ultra-simple environment for building modern web
applications.

With Meteor you write apps:

* in modern JavaScript
* that send data over the wire, rather than HTML
* using your choice of popular open-source libraries

Try a getting started tutorial:
 * [React](https://react-tutorial.meteor.com)
 * [Blaze](https://www.meteor.com/tutorials/blaze/creating-an-app)
 * [Angular](https://www.meteor.com/tutorials/angular/creating-an-app)
 * [Vue](https://www.meteor.com/tutorials/vue/creating-an-app)
 * [Svelte](https://www.meteor.com/tutorials/svelte/creating-an-app)

Next, read the [guide](https://guide.meteor.com) and the [documentation](https://docs.meteor.com/).

Are you looking for examples? Check this [meteor/examples](https://github.com/meteor/examples)

## Quick Start

On Linux/macOS, use this line:

```bash
curl https://install.meteor.com/ | sh
```

On Windows, use this line:

```bash
npm install -g meteor
```

Visit the official [install page](https://www.meteor.com/developers/install) to learn more.

Create a project:

```bash
meteor create try-meteor
```

Run it:

```bash
cd try-meteor
meteor
```

## Developer Resources

Building an application with Meteor?

* Deploy on Galaxy hosting: https://www.meteor.com/cloud
* Announcement list: sign up at https://www.meteor.com/
* Discussion forums: https://forums.meteor.com/
* Join the Meteor community Slack by clicking this [invite link](https://join.slack.com/t/meteor-community/shared_invite/enQtODA0NTU2Nzk5MTA3LWY5NGMxMWRjZDgzYWMyMTEyYTQ3MTcwZmU2YjM5MTY3MjJkZjQ0NWRjOGZlYmIxZjFlYTA5Mjg4OTk3ODRiOTc).


Interested in helping or contributing to Meteor?  These resources will help:

* [Core development guide](DEVELOPMENT.md)
* [Contribution guidelines](CONTRIBUTING.md)
* [Feature requests](https://github.com/meteor/meteor-feature-requests/)
* [Issue tracker](https://github.com/meteor/meteor/issues)

## Uninstalling Meteor

Aside from a short launcher shell script, Meteor installs itself inside your
home directory. To uninstall Meteor, run:

```bash
rm -rf ~/.meteor/
sudo rm /usr/local/bin/meteor
```

On Windows, [read here](npm-packages/meteor-installer/README.md).
