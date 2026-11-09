export const getServerPackageAsset = async () => {
  return await Assets.getTextAsync('server-asset.txt');
};
