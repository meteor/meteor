# Meteor Version Solver

This package implements the Meteor Version Solver, an optimizing constraint solver for package dependencies.  The Version Solver is called by the `meteor` command-line tool when run in the context of an app, package, or build plugin.

For an app, the Version Solver's job is to maintain `.meteor/versions`, XXXX

>The input to a run of the Version Solver consists of:
>
>* The project's direct dependencies and any explicit version constraints (`.meteor/packages`, for an 
>
>* The previously chosen packages and versions (from `.meteor/versions`)

See also the [Meteor Version Solver project page](https://www.meteor.com/version-solver).


