import { Meteor } from 'meteor/meteor';
import { getClientPackageAsset } from 'meteor/my-assets-package';

Meteor.startup(async () => {
  try {
    const clientAsset = await getClientPackageAsset();
    const div = document.createElement('div');
    div.id = 'client-asset';
    div.innerText = clientAsset;
    document.body.appendChild(div);
  } catch (error) {
    console.error('Error fetching client asset:', error);
  }
});
