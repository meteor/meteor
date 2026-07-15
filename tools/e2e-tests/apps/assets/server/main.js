import { Meteor } from 'meteor/meteor';
import { getServerPackageAsset } from 'meteor/my-assets-package';

Meteor.startup(async () => {
  try {
    const packageAsset = await getServerPackageAsset();
    console.log(`__PACKAGE_ASSET__=${packageAsset}`);
    
    const appAsset = await Assets.getTextAsync('app-asset.txt');
    console.log(`__APP_ASSET__=${appAsset}`);
  } catch (error) {
    console.error('Error reading assets:', error);
  }
});
