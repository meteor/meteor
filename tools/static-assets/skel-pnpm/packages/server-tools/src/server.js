const packageInfo = {
  name: "@example/server",
  compiledByMeteor: true,
};

export const describeServerPackage = () =>
  `${packageInfo.name}:${packageInfo.compiledByMeteor ? "compiled" : "raw"}`;
