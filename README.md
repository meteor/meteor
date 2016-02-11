# Meteor

Meteor is an ultra-simple environment for building modern web
applications.

With Meteor you write apps:

* in pure JavaScript
* that send data over the wire, rather than HTML
* using your choice of popular open-source libraries

# Part A --------------------------------------------
Decide on the most appropriate placement for your non-technical introduction within the already present content of the forked repository’s README.md. This is likely just following the current introductory paragraph. Rewrite and polish your writing many times until you believe a blooming adolescent could grasp the goals of the repository based on your clearly written introduction.

Meteor is an open source JavaScript ecosystem that enables you to build web applications. Its two most important features are firstly, it's isomorphic, which means that the same javascript code can be used at the front and back end. Therefore, saving time and effort. And, secondly it is an ecosystem. Unlike a framework such as Angular.js or a library such as JQuery, Meteor contains tools, libraries, a database, and package managers which means you have at your disposal everything to code a web app from start to end within the Meteor ecosystem. 
 Meteor has many advantages to offer developers. It has a one step installation from the CLI and an API that allows the front and back end to communicate. Meteor also has it's own templating engine (Blaze) and comes with core packages such as signup, login, email etc. Therefore, speeding up development time. 
 



Documentation is available at http://docs.meteor.com/.

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
