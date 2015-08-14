var global = Function("return this")();
if (typeof global.Promise !== "function") {
  // See https://github.com/then/promise#usage for an explanation of why
  // we require promise/domains here.
  global.Promise = require("promise/domains");
}
