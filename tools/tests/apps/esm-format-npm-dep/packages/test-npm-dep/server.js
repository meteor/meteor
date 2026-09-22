// Runs during deferred package initialization, when Npm.require() must
// resolve against this package's own node_modules.
const leftPad = Npm.require('left-pad');
console.log('NPM_DEP_OK ' + leftPad('x', 3, '-'));
