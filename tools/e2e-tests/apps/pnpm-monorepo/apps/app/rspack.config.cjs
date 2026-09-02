const path = require('path');
const { defineConfig } = require('@meteorjs/rspack');

const workspacePackageDirs = [
  '@example/shared',
  '@example/server',
  '@example/ui',
].map(packageName => path.join(__dirname, 'node_modules', packageName));

module.exports = defineConfig(Meteor => ({
  ...Meteor.compileWithRspack(workspacePackageDirs),
}));
