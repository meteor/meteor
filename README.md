### Hot Module Reload

As an alternative to Hot Code Push in development, Hot Module Reload replaces  modules in the bundle that were modified without reloading the page.

Use:
```
  meteor run --release zodern:COMET --include-packages zodern:hot
```

#### API

`module.hot.accept()` - The module will be rerun whenever it or any of its dependencies are modified

`module.hot.decline()` - If the module or any of its dependencies are modified, hot code push will be used instead of HMR.

These should be wrapped by
```
if (module.hot) {
  // Use module.hot here
}
```

Minifiers are able to remove the if statement for production, though none of the common minifiers for Meteor currently do.

#### Implementation details

For now, the linker emits an event that packages, such as zodern:hot, can listen to for an up to date list of files in an unibuild. Eventually this will be replaced with moving the HMR code from a build plugin into the meteor-tool.

The zodern:hot package compares the list of files between builds to identify what has changed. When a client tries to do a hot code push, the client will request changes over a websocket from the build plugin. If possible, it will use HMR to update the modules. Otherwise, it will let the page to be reloaded by hot code push.

The client uses a modified version of [install](https://www.npmjs.com/package/install) to allow replacing modules. To force it to be loaded at the correct time, the meteor-tool adds the `zodern:modules-runtime-hot` dependency to `modules`.

#### Remaining tasks

This is an early version, and there is still a long list of items to implement.

- HMR is unavailable until the second time the architecture was linked, usually the second rebuild. This should be fixed by storing the necessary information in the linker cache.
- If the files were modified to be the same as a previous build, Meteor will use a cache entry in the linker cache, and HMR will not be able to apply the changes.
- Support full webpack HMR API
- Look into allowing packages to replace the HMR api to allow experimentation
- Look into an api to allow packages to run code before and after each module is run. This could be used to implement react fast reload and for packages to automatically clean up after a file is modified. For example, this could be used to remove methods and publications previously added by a modified file.
- Better integration with the autoupdate and reload packages
- Require secret from client before sending changes over websocket
- Submit PRs for reify and install to add necessary apis and functionality for HMR

HMR is only enabled for the `web.browser` architectures. These architectures are remaining:
- web.browser.legacy
- web.cordova
- server architectures

HMR is not supported in these situations. Hot code push will be used instead:
- A package is modified
- A file is added
- A file is removed
- Files were modified that do not have a module id, are bare, are json data, or do not have meteorInstallOptions

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
 * [React](https://www.meteor.com/tutorials/react/creating-an-app)
 * [Blaze](https://www.meteor.com/tutorials/blaze/creating-an-app)
 * [Angular](https://www.meteor.com/tutorials/angular/creating-an-app)
 * [Vue](https://www.meteor.com/tutorials/vue/creating-an-app)

Next, read the [guide](https://guide.meteor.com) and the [documentation](https://docs.meteor.com/).

## Quick Start

On Windows, the installer can be found at https://www.meteor.com/install.

On Linux/macOS, use this line:

```bash
curl https://install.meteor.com/ | sh
```

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

* Deploy on Galaxy hosting: https://www.meteor.com/hosting
* Announcement list: sign up at https://www.meteor.com/
* Having problems? Ask for help at: https://stackoverflow.com/questions/tagged/meteor
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

On Windows, just run the uninstaller from your Control Panel.
