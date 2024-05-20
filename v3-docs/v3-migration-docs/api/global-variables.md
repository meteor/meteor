# Global Variables

On apps, instead of using `GlobalVar = { ... }` to define a global variable, you should use `global.GlobalVar = { ... }`.

Defining globals in **packages** should still work the same as in Meteor 2.

> For packages, Meteor adds a variable declaration in the package scope, which has the side effect of avoiding this mechanic altogether. In apps, there is no  "app scope" so these globals are true globals.