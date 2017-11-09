// Accepts a combined Cordova package ID + version string, then parses out
// and returns the ID and version in a package details object.
//
// Example `packageIdAndVersion` formats:
// some-cordova-plugin@1.0.0
// @somescope/some-cordova-plugin@1.0.0
exports.parse = packageIdAndVersion => {
  const packageDetails = {};
  if (packageIdAndVersion) {
    const [
      _matchText,
      scope,
      packageName,
      version,
    ] = packageIdAndVersion.match(
      /^(?:@([^\/]+)\/)?([^\/@]+)@?(.+)?/
    );
    packageDetails.id = (scope ? `@${scope}/` : '') + packageName;
    packageDetails.version = version ? version : null;
  }
  return packageDetails;
};
