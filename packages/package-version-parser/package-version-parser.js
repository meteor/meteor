var semver = Npm.require('semver');

PackageVersion = {};

PackageVersion.parse = function (versionString) {
  if (typeof versionString !== "string")
    throw new TypeError("versionString must be a string");

  var splitted = versionString.split('@');

  var versionDesc = { name: "", version: null, sticky: false };
  var name = splitted[0];
  var version = splitted[1];

  if (! /^[a-z0-9-]+$/.test(name) || splitted.length > 2)
    throw new Error("Package name must contain lowercase latin letters, digits or dashes");

  versionDesc.name = name;

  if (splitted.length === 2 && !version)
    throw new Error("semver version cannot be empty");

  if (version) {
    if (version.charAt(0) === '=') {
      versionDesc.sticky = true;
      version = version.substr(1);
    }

    // XXX check for a dash in the version in case of foo@1.2.3-rc0

    if (! semver.valid(version))
      throw new Error(version + " doesn't look like a semver version (e.g. 1.2.0)");

    versionDesc.version = version;
  }

  return versionDesc;
};

