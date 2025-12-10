# Audit Argument Checks


This package causes Meteor to require that all arguments passed to methods and
publish functions are [checked](../api/check.md). Any method that does not pass each
one of its arguments to `check` will throw an error, which will be logged on the
server and which will appear to the client as a
`500 Internal server error`. This is a simple way to help ensure that your
app has complete check coverage.

Methods and publish functions that do not need to validate their arguments can
simply run `check(arguments, [Match.Any])` to satisfy the
`audit-argument-checks` coverage checker.
