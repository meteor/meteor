// On Windows, we install npm with --no-bin-links because the PREFIX we
// use would cause npm to put the commands in the wrong place, but we
// still want to make sure those commands end up in dev_bundle\bin, so
// this script takes care of that.

const path = require("path");
// This script infers everything it needs to know from the location of
// node.exe, so make sure to use the right dev_bundle\bin\node.exe.
const binDir = path.dirname(process.execPath);
const devBundleDir = path.dirname(binDir);
const npmDir = path.join(devBundleDir, "lib", "node_modules", "npm");
const npmPkgBin = require(path.join(npmDir, "package.json")).bin || {};
// This is the same helper package that npm uses to create bin commands.
const shim = require(path.join(npmDir, "node_modules", "cmd-shim"));
const promises = [];

Object.keys(npmPkgBin).forEach(cmd => {
  if (cmd === "npm") {
    // We already install our own dev_bundle\bin\npm.cmd.
    return;
  }
  const relPosixPath = npmPkgBin[cmd];
  const parts = path.posix.normalize(relPosixPath).split(path.posix.sep);
  parts.unshift(npmDir);
  const absSource = path.join.apply(path, parts);
  const absTarget = path.join(binDir, cmd);
  promises.push(new Promise((resolve, reject) => {
    shim(absSource, absTarget, error => {
      error ? reject(error) : resolve(cmd);
    })
  }));
});

Promise.all(promises).then(items => {
  console.error("Linked npm bin commands: " + items.join(", "));
}, error => {
  console.error("Failed to link bin commands: " + error);
});
