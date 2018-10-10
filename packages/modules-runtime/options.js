makeInstallerOptions = {};

if (typeof Profile === "function" &&
    process.env.METEOR_PROFILE) {
  makeInstallerOptions.wrapRequire = function (require) {
    return Profile(function (id) {
      return "require(" + JSON.stringify(id) + ")";
    }, require);
  };
}
