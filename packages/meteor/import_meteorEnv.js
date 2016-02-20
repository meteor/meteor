// Need to re-export `meteorEnv` from `Package["meteor-env-{dev,prod}"]`
// because the linker doesn't automatically import symbols from
// `debugOnly` or `prodOnly` packages.

meteorEnv = (
  Package["meteor-env-dev"] ||
  Package["meteor-env-prod"]
).meteorEnv;
