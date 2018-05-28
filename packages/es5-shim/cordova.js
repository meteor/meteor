// Since Cordova renders boilerplate HTML at build time, and doesn't use
// the server-render system through the webapp package, it's important
// that we include es5-shim (and sham) statically for Cordova clients.
require("./import_globals.js");
require("es5-shim/es5-shim.js");
require("es5-shim/es5-sham.js");
require("./export_globals.js");
