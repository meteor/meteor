export const getClientPackageAsset = async () => {
  try {
    const response = await fetch('/packages/my-assets-package/client-asset.txt');
    return await response.text();
  } catch (error) {
    console.error('Error fetching client package asset', error);
  }
};
