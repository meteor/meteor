if (process.env.ROOT_URL &&
    typeof __meteor_runtime_config__ === "object") {
  __meteor_runtime_config__.ROOT_URL = process.env.ROOT_URL;
  var pathPrefix = Npm.require('url').parse(__meteor_runtime_config__.ROOT_URL).pathname;
  __meteor_runtime_config__.ROOT_URL_PATH_PREFIX = pathPrefix === "/" ? "" : pathPrefix;
}
