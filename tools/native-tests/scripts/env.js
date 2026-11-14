function buildNativeTestEnv(baseEnv = process.env, overrides = {}) {
  const env = {
    ...baseEnv,
    ...overrides,
    DO_NOT_TRACK: "1",
  };
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  return env;
}

module.exports = {
  buildNativeTestEnv,
};
