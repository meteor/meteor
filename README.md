# Meteor

Meteor is an ultra-simple environment for building modern web
applications.

With Meteor you write apps:

* in pure JavaScript
* that send data over the wire, rather than HTML
* using your choice of popular open-source libraries

Documentation is available at http://docs.meteor.com/.

Try the getting started [tutorial](https://www.meteor.com/try).

# When and what to use Meteor for

You should consider using Meteor for developing single page web and mobile applications that require realtime rendering of data. For example webapps that display real time rendering of graphs, user comments etc. This is possible through its inbuilt reactive programming model which makes it easier to build real time web applications. One of the principles of Meteor is "Simplicity equals productivity". This is demonstrated in Meteor as the same line of code can run both on the client and server side. Additionaly, JavaScript is used for the front and back ends. Both these factors make Meteor beginner friendly. Meteor is also a good choice for startups that require a minimal viable product in a short period of time, as the Meteor ecosystem includes smart packages and one command deploy option that speed up development.
 
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
