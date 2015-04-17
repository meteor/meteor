# Meteor Version Solver

This package implements the Meteor Version Solver, an optimizing constraint solver for package dependencies.  The Version Solver is called by the `meteor` command-line tool when run in the context of an app, package, or build plugin.

### Background

Each app or package has a list of *dependencies*, which are packages it depends on, and *constraints* on those dependencies, which specify the versions of the dependencies that the app or package is compatible with.  These dependencies and constraints are listed in `.meteor/packages` for an app, and are specified with calls to `api.use` in `package.js` for a package.  Meteor will refuse to link an app or package if the constraints on its dependencies cannot be satisfied.

Each app also contains a `.meteor/versions` file, which lists all the packages needed to run the app, including those depended on directly and those depended on indirectly (via other packages), and a version number for each one.  When you run the app, Meteor adheres to the versions in this file as closely as possible, so that your runs and builds are reproducible.  While you can edit `.meteor/versions` manually, Meteor will generate and manage it automatically for you.  For example, when you run `meteor add myforms`, Meteor will first add `myforms` to `.meteor/packages`, and then it will add entries for `myforms` and any packages it uses to `.meteor/versions`.  At the same time, Meteor may need to adjust previously-chosen versions of other packages to satisfy new constraints, and that is where the Version Solver comes in.  The `.meteor/versions` file should be checked into source control (such as git), so that your builds are reproducible across machines and you have a paper trail of any modifications made by Meteor.

A fresh Meteor app might have a `.meteor/packages` that looks like this:

```
meteor-platform
autopublish
insecure
```

The `.meteor/versions` file might begin as follows:

```
autopublish@1.0.3
autoupdate@1.2.1
base64@1.0.3
binary-heap@1.0.3
blaze@2.1.2
...
```

Note that the `@` sign in `.meteor/versions` does not designate a constraint, but an exact version.  The `.meteor/packages` file may have constraints (following the package name, separated by an `@`), but they are optional.

Constraints in `.meteor/packages` are often not necessary, but sometimes useful.  The versions of core packages (such as `meteor-platform`) are determined by what release of Meteor you are running.  For non-core packages, Meteor will choose a version at the time you add the package with `meteor add mypackage` (generally the latest version at the time).  If you want to bump the version, you use `meteor update mypackage`, which will make the necessary adjustments to `.meteor/versions`.  If you want a very specific version, the best way to acheive that is to list it in `.meteor/packages`.

Because `.meteor/packages` underspecifies the versions used in your app, `.meteor/versions` is the authoritative source that says what package versions your app is being developed against.  It is *not* a cache of running the Version Solver on `.meteor/packages`, but a major input to the Version Solver itself.  For example, if `.meteor/versions` has an entry `mypackage@1.5.0`, your app may be using a feature of `mypackage` that was introduced in `1.5.0`.  (For this reason, the Version Solver tries extra hard to never downgrade the version of a direct dependency of your app.)  If you were to wipe `.meteor/versions` (or not check it into git), Meteor would regenerate it based on `.meteor/packages`, but your app may well not work.  The important thing to remember is that even though `.meteor/versions` is automatically maintained by Meteor, it is part of your project configuration.

Packages nested inside Meteor application directories use the application's `.meteor/versions` file.  Packages not inside an application directory get a `.versions` file that is a direct analogue of `.meteor/versions` and should also be checked into source control.  These files are relevant for the `meteor publish` command, in particular when build plugins are in use (because the versions of those are chosen at build time rather than use time).  Due to an outstanding bug (#4170), the versions file is not properly respected by `meteor test-packages`.

XXX TODO

* Form of a constraint

* Version selection (cost function)

* Input and output of a run of the Version Solver

See also the [Meteor Version Solver project page](https://www.meteor.com/version-solver).


