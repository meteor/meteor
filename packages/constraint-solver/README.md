# Meteor Version Solver

This package implements the Meteor Version Solver, an optimizing constraint solver for package dependencies.  The Version Solver is invoked by the `meteor` command-line tool in the context of an app, package, or build plugin.

### Background

Each app or package has a list of *dependencies*, which are packages it depends on, and *constraints* on those dependencies, which specify the versions of the dependencies that the app or package is compatible with.  These dependencies and constraints are listed in an app's `.meteor/packages` file, and are specified with calls to `api.use` in a package's `package.js` file.  Meteor will refuse to link an app or package if its dependencies are not present or if the constraints on its dependencies cannot be satisfied.  Packages may also have "weak" dependencies, which do not require a dependency to be present, but enforce a version constraint if it is.

Each app contains a `.meteor/versions` file, which lists all the packages needed to run the app, including direct and indirect dependencies, and a version number for each one.  ("Indirect" dependencies are the dependencies of the dependencies, together with the dependencies of those, and so on.)  When you run the app, Meteor adheres to the versions in this file as closely as possible, so that your runs and builds are reproducible.

Meteor generates and manages the `.meteor/versions` file for you automatically.  For example, when you run `meteor add myforms`, Meteor will first add `myforms` to `.meteor/packages`, and then it will add entries for `myforms` and any packages it uses to `.meteor/versions`.  At the same time, Meteor may need to adjust previously-chosen versions of other packages to satisfy new constraints, and that is where the Version Solver comes in.

The `.meteor/versions` file should be checked into source control (such as git), so that your builds are reproducible across machines and you have a paper trail of any modifications made by Meteor.

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

The versions of core packages (such as `meteor-platform`) are determined by what release of Meteor you are running.  For non-core packages, Meteor will choose a version at the time you add the package with `meteor add mypackage` (generally the latest version at the time).  If at any time you want to bump the version of `mypackage`, you can use `meteor update mypackage`, which will make the necessary adjustments to `.meteor/versions`.  If you want to use a very specific version, the best way to do so is to put an exact equality constraint in `.meteor/packages`.

Because `.meteor/packages` usually underspecifies the versions used in your app, `.meteor/versions` is the authoritative source that says what package versions your app is being developed against.  It is *not* a cache of running the Version Solver on `.meteor/packages`, but a major input to the Version Solver itself.  For example, if `.meteor/versions` has an entry `mypackage@1.5.0`, your app may be using a feature of `mypackage` that was introduced in `1.5.0`.  (For this reason, the Version Solver tries extra hard to never downgrade the version of a direct dependency of your app.)  If you were to wipe `.meteor/versions` (or not check it into git), Meteor would regenerate it based on `.meteor/packages`, but your app might not work.  The important thing to remember is that even though `.meteor/versions` is automatically maintained by Meteor, it is part of your project configuration.

Packages nested inside Meteor application directories use the application's `.meteor/versions` file.  Packages not inside an application directory get a `.versions` file that is a direct analogue of `.meteor/versions` and should also be checked into source control.  These files are relevant for the `meteor publish` command, in particular when build plugins are in use (because the versions of those are chosen at build time rather than use time).  Due to an outstanding bug (#4170), the versions file is not properly respected by `meteor test-packages`.

Only one version of each package may be used at a time.  This restriction may be lifted in the future, allowing multiple version of a package to be used in parallel when necessary.

### Version Numbers

Version numbers of a Meteor package are based on [Semantic Versioning](http://semver.org/).

A quick overview of Semantic Versioning: A version number consists of three non-negative integers separated by dots (X.Y.Z) which are called the major version, minor version, and patch version.  These numbers may become arbitrarily large, and they are incremented based on the type of change, not aesthetics (so versions like 1.0.176 or 23.0.0 are considered normal).  As a rule, the major version is incremented if any backwards-incompatible changes are made to the public API.  The minor version is incremented if the public API gains new features or marks features as deprecated, or in the case of substantial under-the-hood changes, all without breaking backwards compatibility of the public API.  The patch version is incremented for bug fixes.
Prerelease version numbers consist of a normal version, a hyphen, and a series of segments separated by dots, each of which is an identifier or an integer, such as `1.2.3-rc.5` for release candidate 5.  This allows `1.2.3-rc.5` to sort before `1.2.3-rc.10`, which in turn sorts before `1.2.3`.

Note about major versions: Because the Version Solver is highly concerned with version compatibility, bumping a major version of a package is a big deal, as well it should be.  Semantic Versioning forces us to confront the work created by breaking API changes, because while a breaking change potentially creates work for consumers of the package downstream in any model, by following Semantic Versioning, the Version Solver treats a major version mismatch as a hard error, forcing package and app maintainers downstream to explicitly opt into the new version.

Wrap Numbers: Meteor adds the concept of a "wrap number," which is useful when a Meteor package wraps an npm package (or other kind of package from another system).  For each Semantic Version `V`,
there is a series of Meteor package versions `V`, `V_1`, `V_2`, and
so on for all positive integers.  This allows you to base the version of a Meteor package on the version of the wrapped package, and still
publish improvements and bugfixes to the wrapper.

Prereleases: You are welcome to assign prerelease versions to your Meteor packages.  Note that the Version Solver always prefers non-prerelease versions, unless a particular prerelease is asked for explicitly, or a prerelease version is necessary to satisfy a constraint.  A constraint like `foo@1.0.0-pre.1` is satisfied by `foo@1.0.0`.  Wrap numbers and prereleases only combine in one direction, so `1.0.0-rc.1_5` is allowed, but not `1.0.0_5-rc.1`
(in other words, you can wrap a prerelease version of a package, but you can't issue a prerelease of a wrapper package that has a wrap number).  One use for package RCs is for package authors to coordinate with Meteor RCs, by releasing an RC version of a package that will be selected when a particular RC of Meteor is being used.

### Constraints

A *package constraint* such as `foo@1.2.3` or `bar@=3.4.5` consists of a package name, an `@` sign, and a *version constraint*.

The most basic type of version constraint is just a version, as in `foo@1.2.3`.  This is called a *compatible-with* constraint, and allows versions of `foo` that are greater than or equal to `1.2.3`, but not greater than or equal to `2.0.0` (the next major version).

An *exact equality* constraint looks like `bar@=3.4.5`, and matches only the version specified.

These two kinds of *simple constraints* can be combined into a list of alternatives separated by `||` with optional whitespace, as in `baz@1.0.0||2.0.0`, which will match any 1.x or 2.x version of `baz`.

### Version Solver Input and Output

The Version Solver is run by any `meteor` command that inspects, modifies, or runs an app or package.  The main inputs are `.meteor/packages` and `.meteor/versions`, and if `.meteor/versions` is missing, incomplete, or needs modification, the results of version selection will be written back to it.

The complete set of inputs to the Version Solver (with the names used in the source code) is as follows:

* `dependencies` - The direct dependencies of the app or package, read from `.meteor/packages` or `package.js`
* `constraints` - The constraints on direct dependencies, also from `.meteor/packages` or `package.js`.
* `upgrade` - The list of package names specified on the command line when running `meteor update`
* `previousSolution` - The contents of `.meteor/versions` (or `.versions` for a package with no enclosing app), if present
* `allowIncompatibleUpdate` - Whether the `--allow-incompatible-update` command-line flag was passed
* `upgradeIndirectDepPatchVersions` - Whether to bump patch versions and wrap numbers of indirect dependencies, which happens when you type `meteor update` with no arguments
* `anticipatedPrereleases` - List of prereleases mentioned by name (e.g. in top-level constraints), which don't count when trying to avoid selecting prerelease versions

The output of the Version Solver is a mapping from package names to versions of those packages, which specifies which packages were selected, and which version of each package was selected.

There are some hard requirements on any solution returned by the Version Solver.  For every package in `dependencies`, some version of that package must be selected, and the versions must satisfy the `constraints`.  For every package version selected, some version of every strong (non-weak) dependency of that package version must be selected, and all version constraints specified by the package must be satisfied.  The Version Solver is also required not to select any superfluous packages.

Within these requirements, many possible choices of package versions are typically possible.  However, the Version Solver is also required to stick as close as possible to `.meteor/versions` (also known as `previousSolution`), and in the common case where this file is present and valid, it will dictate the entire solution.  If the previous solution is not valid for some reason -- for example, because `.meteor/packages` has changed or the dependencies of a local package have changed -- or if `meteor update` is being used to update a package, the Version Solver still tries to make as few changes, and as small changes, as possible.

The Version Solver's priorities when selecting versions are described in the next section.

### Optimization

The Version Solver performs a global optimization, using a SAT solver, in order to meet goals such as updating a package's version while changing the versions of other packages as little as possible, and also choosing versions for any new packages that must be added as indirect dependencies.

Because different versions of a package can have different dependencies, and conflicts may result from certain choices, the Version Solver occasionally faces tough trade-offs.  For example, it may be possible to either update package A or package B to the latest version, but not both simultaneously.  Adding package A may require downgrading package B, as in the following example.

Example: Adding new package A to the project requires downgrading existing package B.  This might happen if all versions of A require a 1.x version of package C, while some newer versions of B require a 2.x version of package C.  Therefore, if package A is added to the project, some versions of B are not legal to choose, and if such a version is currently selected (i.e. present in `.meteor/versions`), then B will have to be downgraded.

Optimization proceeds in "steps."  Each step specifies a "cost function" that conceptually assigns a cost to each possible solution (where a solution is a mapping of selected packages to their selected versions).  For each step, in order, the minimum possible cost is found that still admits a solution, and the solution space is constrained so that only solutions with this low cost are considered from then on.

For example, when you run `meteor update foo`, one of the steps is concerned with trying to maximize the major version of `foo`.  Expressed in terms of minimizing a cost function, we would say we want to minimize the "out-of-dateness" of the major version of `foo`, where out-of-dateness is defined as the number of greater versions available.  If `foo` exists in versions `1.0.0`, `2.0.0`, `2.1.0`, and `3.0.0`, these versions would be assigned "major out-of-dateness" of 2, 1, 1, and 0.  To perform this particular minimization step, the Version Solver determines the lowest possible cost, and then constrains the solution space to make sure this cost is achieved.  Supposing `foo 3.0.0` can't be chosen because of conflicts but `2.0.0` and `2.1.0` can, the minimum cost would be 1, and further optimization would be performed under the constraint that a 2.x verison be chosen for `foo`.

Similarly, if a step were to say that we should change as few versions as possible from the ones in `.meteor/versions`, the Version Solver would first find the fewest number of versions it is possible to change -- say, 2 -- and then require that exactly 2 versions be changed by whatever solution is ultimately chosen.

Note that earlier optimization steps take precedence, by the very nature of this system, so we have to order the steps carefully.  It is much better to change two patch versions than one major version, so it would be advisable for an early step to require changing as few versions as possible.

The optimization steps performed are, in order:

XXX explain these better

* Minimize number of "unanticipated" prerelease versions chosen
* Minimize out-of-dateness of `meteor update` packages (major, minor, patch, wrap)
* Minimize number of "incompatible" changes to direct dependencies (major version changes and downgrades)
* Minimize change distance to direct dependencies with respect to `.meteor/version` (major, minor, patch, wrap)
* Minimize change distance to indirect dependencies with respect to `.meteor/versions` (major, minor, patch, wrap)
* Minimize out-of-dateness of "new" direct dependencies (major, minor, patch, wrap)
* Minimize major and minor versions of "new" indirect dependencies
  ("version gravity" - XXX explain this more)
* Minimize out-of-dateness of patch and wrap versions of "new" indirect dependencies
* Minimize the total number of packages selected (to remove superfluous packages)

TODO:

* XXX `upgradeIndirectDepPatchVersions`
* XXX indirect dependency version gravity
* XXX `--allow-incompatible-update`

### See also

* The [Meteor Version Solver project page](https://www.meteor.com/version-solver).

* [package.js docs](http://docs.meteor.com/#/full/packagejs)

* [logic-solver](../logic-solver), the SAT-solving package used by constraint-solver
