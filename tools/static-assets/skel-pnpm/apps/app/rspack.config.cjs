const path = require("path");
const { defineConfig } = require("@meteorjs/rspack");

// pnpm workspaces resolve by package name without extra Rspack configuration.
// This optional rule shows how to force raw workspace sources through SWC when
// a package needs explicit transpilation; remove it for precompiled packages.
const pnpmWorkspacePackageDirs = ["@example/shared", "@example/server", "@example/ui"].map(
  (packageName) => path.join(__dirname, "node_modules", packageName),
);

module.exports = defineConfig((Meteor) => ({
  ...Meteor.compileWithRspack(pnpmWorkspacePackageDirs),
}));
