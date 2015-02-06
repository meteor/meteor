Package.describe({
  name: "~package-name~", // replaced via `Sandbox.prototype.createPackage`
  summary: ' /* Fill me in! */ ',
  version: '1.0.19',
  git: ' /* Fill me in! */ ',
  documentation: null
});

Npm.depends({
  // An npm package published by sashko that has some colons in the paths
  // if you would like to edit it, download it with `npm install` and then
  // publish a new version
  "test-colons2": "1.0.2"
});
