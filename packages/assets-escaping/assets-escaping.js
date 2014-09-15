AssetsEscaping = {};
AssetsEscaping.escape = function (url) {
  // XXX replacing colons with underscores as colon is hard to escape later
  // on different targets and generally is not a good separator for web and
  // other platforms. E.g.: on Windows it is not a valid char in filename,
  // Cordova also rejects it, etc.
  // XXX should escape better with encodeURI? needs to be a fine escaping for
  // Cordova/Phonegap
  return url.replace(/:/g, '_');
};

