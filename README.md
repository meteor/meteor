# Meteor

Meteor is an ultra-simple environment for building modern web
applications.

With Meteor you write apps:

* in pure JavaScript
* that send data over the wire, rather than HTML
* using your choice of popular open-source libraries

Documentation is available at http://docs.meteor.com/.

## What to Use Meteor for and When to Use It

Meteor is an excellent choice for your next web or mobile app. It excels at fast synchronization of data between client and server, and thanks to Meteor's secret sauce, *the collection* (stored in browser memory), accessing and modifying the data appears instantaneous to the end user. Are you ever frustrated by the project structure that other frameworks impose on you? Meteor is agnostic in this regard and allows you to set up your project in whatever way works for you.

Use Meteor when you require an easy to learn, use, and deploy, full stack Javascript solution. Meteor's full stack yet customizable solution means the freedom to install your favorite components or take advantage of Meteor's own powerful libraries, like Blaze and Tracker. This flexibility allows you to spend your valuable time on what's important - creating an amazing app that delights everyone who uses it. And because you can leverage your existing Javascript skills you can be up and running with a production quality app in an amazingly short amount of time.

Try the getting started [tutorial](https://www.meteor.com/try).

## Quick Start

Install Meteor:

```bash
curl https://install.meteor.com | /bin/sh
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

Deploy it to the world, for free:

```bash
meteor deploy try-meteor.meteor.com
```

## Slow Start (for developers)

If you want to run on the bleeding edge, or help develop Meteor, you
can run Meteor directly from a git checkout.

```bash
git clone git://github.com/meteor/meteor.git
cd meteor
```

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

```bash
./meteor --help
```

From your checkout, you can read the docs locally. The `/docs` directory is a
meteor application, so simply change into the `/docs` directory and launch
the app:

```bash
cd docs/
../meteor
```

You'll then be able to read the docs locally in your browser at
`http://localhost:3000/`.

Note that if you run Meteor from a git checkout, you cannot pin apps to specific
Meteor releases or run using different Meteor releases using `--release`.

## Uninstalling Meteor

Aside from a short launcher shell script, Meteor installs itself inside your
home directory. To uninstall Meteor, run:

```bash
rm -rf ~/.meteor/
sudo rm /usr/local/bin/meteor
```

## Developer Resources

Building an application with Meteor?

* Announcement list: sign up at http://www.meteor.com/
* Ask a question: http://stackoverflow.com/questions/tagged/meteor
* Discussion forums: https://forums.meteor.com/

Interested in contributing to Meteor?

* Issue tracker: https://github.com/meteor/meteor/issues
* Contribution guidelines: https://github.com/meteor/meteor/tree/devel/Contributing.md

We are hiring!  Visit https://www.meteor.com/jobs to
learn more about working full-time on the Meteor project.
