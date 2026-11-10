const packageInfo = {
  name: '@example/server',
  compiled: true,
};

export const describeServerPackage = () => {
  return `${packageInfo.name}:${packageInfo.compiled ? 'compiled' : 'raw'}`;
};
