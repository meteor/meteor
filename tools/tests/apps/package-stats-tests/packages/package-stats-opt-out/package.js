// This is a replica of the core package-stats-opt-out package. It
// exists to make it so that we can add package-stats-opt-out to this
// app without needing to be using a release that has core packages in
// it (such as using a sandbox created with a `warehouse` argument).

Package.describe({
  summary: "a replica of a core package",
  version: "1.0.0"
});
