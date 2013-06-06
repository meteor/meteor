if (process.env.ROOT_URL &&
    typeof __meteor_runtime_config__ === "object")
  __meteor_runtime_config__.ROOT_URL = process.env.ROOT_URL;
if (process.env.ABSOLUTE_URL &&
    typeof __meteor_runtime_config__ === "object")
  __meteor_runtime_config__.ABSOLUTE_URL = true;
