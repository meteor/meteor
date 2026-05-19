const packageInfo = {
  name: 'server-tools',
  compiled: true,
};

export const describeServerPackage = () => {
  return `${packageInfo.name}:${packageInfo.compiled ? 'compiled' : 'raw'}`;
};
