if (typeof Profile === "function" &&
    process.env.METEOR_PROFILE) {
  var Mp = meteorInstall.Module.prototype;
  Mp.require = Profile(function (id) {
    return "require(" + JSON.stringify(id) + ")";
  }, Mp.require);
}
