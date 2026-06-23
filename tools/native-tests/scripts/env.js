function buildNativeTestEnv(baseEnv = process.env, overrides = {}) {
  const env = {
    ...baseEnv,
    ...overrides,
  };
  delete env.NO_COLOR;
  return env;
}

module.exports = {
  buildNativeTestEnv,
};
