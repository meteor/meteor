# Meteor

[![TravisCI Status](https://travis-ci.org/meteor/meteor.svg?branch=devel)](https://travis-ci.org/meteor/meteor)
[![CircleCI Status](https://circleci.com/gh/meteor/meteor/tree/devel.svg?style=shield&circle-token=c2d3c041506bd493ef3795ffa4448684cfce97b8)](https://circleci.com/gh/meteor/meteor/tree/devel)

Meteor is an ultra-simple environment for building modern web
applications.

With Meteor you write apps:

* in pure JavaScript
* that send data over the wire, rather than HTML
* using your choice of popular open-source libraries

Try the getting started [tutorial](https://www.meteor.com/try).

Next, read the [guide](http://guide.meteor.com) or the reference documentation at http://docs.meteor.com/.

## Quick Start

On Windows, simply go to https://www.meteor.com/install and use the Windows installer.

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

## Slow Start (for developers)

If you want to run on the bleeding edge, or help develop Meteor, you
can run Meteor directly from a git checkout.

### Clone

```bash
git clone --recursive git://github.com/meteor/meteor.git
cd meteor
```

The `--recursive` flag ensures that submodules will be initialized and
updated as part of the cloning process. If you cloned the `meteor`
repository without the `--recursive` flag, you can equivalently run

```bash
git submodule update --init --recursive
```

in the root of the `meteor` repository. The typical symptom of not
updating submodules will be `Error: Depending on unknown package ...`
when you run most Meteor commands.

### Create testing app

To create a local app to test with your Meteor checkout this is a good 
structure:

```
./meteor
./demo-app
```

Create the demo app by running:

```bash
./meteor/meteor create demo-app
```

To run the demo-app with the local copy of Meteor:

```bash
cd demo-app
../meteor/meteor
```

The first time you will see a message which confirms running locally:

> It's the first time you've run Meteor from a git checkout.

### Build from scratch

If you're the sort of person who likes to build everything from scratch,
you can build all the Meteor dependencies (node.js, npm, mongodb, etc)
with the provided script. This requires git, a C and C++ compiler,
autotools, and scons. If you do not run this script, Meteor will
automatically download pre-compiled binaries when you first run it.

```bash
# OPTIONAL
./scripts/generate-dev-bundle.sh
```

Now you can run meteor directly from the checkout (if you did not
build the dependency bundle above, this will take a few moments to
download a pre-build version).

Run at least one Meteor command to install required dependencies, like:

```bash
./meteor --help
```

You local Meteor checkout is now ready for use.

Note that if you run Meteor from a git checkout, you cannot pin apps to specific
Meteor releases or run using different Meteor releases using `--release`.

## Uninstalling Meteor

Aside from a short launcher shell script, Meteor installs itself inside your
home directory. To uninstall Meteor, run:

```bash
rm -rf ~/.meteor/
sudo rm /usr/local/bin/meteor
```

On Windows, just run the uninstaller from your Control Panel.

## Developer Resources

Building an application with Meteor?

* Announcement list: sign up at http://www.meteor.com/
* Having problems? Ask for help at: http://stackoverflow.com/questions/tagged/meteor
* Discussion forums: https://forums.meteor.com/

Interested in contributing to Meteor?

* Issue tracker: https://github.com/meteor/meteor/issues
* Contribution guidelines: https://github.com/meteor/meteor/tree/devel/Contributing.md

We are hiring!  Visit https://www.meteor.com/jobs to
learn more about working full-time on the Meteor project.
