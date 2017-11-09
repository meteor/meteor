// Accepts a combined Cordova package ID + version string, then parses out
// and returns the ID and version in a package details object.
//
// Example `packageIdAndVersion` formats:
// some-cordova-plugin@1.0.0
// @somescope/some-cordova-plugin@1.0.0
exports.parse = packageIdAndVersion => {
  const package = {};
  if (packageIdAndVersion) {
    const [
      _matchText,
      scope,
      scopeSeparator,
      packageName,
      versionSeparator,
      version,
    ] = packageIdAndVersion.match(
      /^(@[^\/]*)?(\/)?([^@]*)(@)?(.*)?/
    );
    package.id =
      (scope ? scope : '') +
      (scopeSeparator ? scopeSeparator : '') +
      packageName;
    package.version = version ? version : null;
  }
  return package;
};
