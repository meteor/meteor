// Command-line arguments passed to npm when rebuilding binary packages.
var args = [
  "rebuild",

  // The --update-binary flag tells node-pre-gyp to replace previously
  // installed local binaries with remote binaries:
  // https://github.com/mapbox/node-pre-gyp#options
  "--update-binary"
];

// Allow additional flags to be passed via the $METEOR_NPM_REBUILD_FLAGS
// environment variable.
var flags = process.env.METEOR_NPM_REBUILD_FLAGS;
if (flags) {
  args = ["rebuild"];
  flags.split(/\s+/g).forEach(function (flag) {
    if (flag) {
      args.push(flag);
    }
  });
}

exports.get = function () {
  // Make a defensive copy.
  return args.slice(0);
};
