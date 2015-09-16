var global = this;

// Because the es5-{shim,sham}.js code assigns to Date and parseInt,
// Meteor treats them as package variables, and so declares them as
// variables in package scope, which causes some references to Date and
// parseInt in the shim/sham code to refer to those undefined package
// variables. The simplest solution seems to be to initialize the package
// variables to their appropriate global values.
Date = global.Date;
parseInt = global.parseInt;

// Save the original String#replace method, because es5-shim's
// reimplementation of it causes problems in markdown/showdown.js.
// This original method will be restored in export_globals.js.
originalStringReplace = String.prototype.replace;
