// In legacy environments, load a polyfill if global.Promise was not
// defined in modern.js.
if (typeof global.Promise === "function") {
  Promise = global.Promise;
} else {
  Promise = global.Promise =
    require("promise/lib/es6-extensions");
}
