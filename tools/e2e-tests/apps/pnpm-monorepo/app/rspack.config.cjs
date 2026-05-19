const path = require('path');
const { defineConfig } = require('@meteorjs/rspack');

const workspacePackageDirs = [
  '@e2e/domain',
  '@e2e/server-tools',
  '@e2e/ui',
].map(packageName => path.join(__dirname, 'node_modules', packageName));

module.exports = defineConfig(Meteor => ({
  ...Meteor.compileWithRspack(workspacePackageDirs),
  resolve: {
    symlinks: false,
  },
}));
