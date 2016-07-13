// Command-line arguments passed to npm when rebuilding binary packages.
var args = [
  "rebuild",

  // The --update-binary flag tells node-pre-gyp to replace previously
  // installed local binaries with remote binaries:
  // https://github.com/mapbox/node-pre-gyp#options
  "--update-binary"
];

exports.get = function () {
  // Make a defensive copy.
  return args.slice(0);
};
