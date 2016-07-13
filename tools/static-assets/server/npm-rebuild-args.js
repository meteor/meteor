// Command-line arguments passed to npm when rebuilding binary packages.
var args = [
  "rebuild",

  // The --no-bin-links flag tells npm not to create symlinks in the
  // node_modules/.bin/ directory when rebuilding packages, which helps
  // avoid problems like https://github.com/meteor/meteor/issues/7401.
  "--no-bin-links",

  // The --update-binary flag tells node-pre-gyp to replace previously
  // installed local binaries with remote binaries:
  // https://github.com/mapbox/node-pre-gyp#options
  "--update-binary"
];

exports.get = function () {
  // Make a defensive copy.
  return args.slice(0);
};
