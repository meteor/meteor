var global = Function("return this")();
if (typeof global.Promise !== "function") {
  global.Promise = require("promise");
}
