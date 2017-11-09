// Accepts a combined Cordova package ID + version string, then parses out
// and returns the ID and version in a package details object.
//
// Example `packageIdAndVersion` formats:
// some-cordova-plugin@1.0.0
// @somescope/some-cordova-plugin@1.0.0
exports.parse = packageIdAndVersion => {
  const package = {};
  if (packageIdAndVersion) {
    const parts = packageIdAndVersion.match(
      /^(@[^\/]*)?(\/)?([^@]*)(@)?(.*)?/
    );
    const details = {
      scope: parts[1],
      scopeSeparator: parts[2],
      packageName: parts[3],
      versionSeparator: parts[4],
      version: parts[5],
    };
    package.id =
      (details.scope ? details.scope : '') +
      (details.scopeSeparator ? details.scopeSeparator : '') +
      details.packageName;
    package.version = details.version ? details.version : null;
  }
  return package;
};
