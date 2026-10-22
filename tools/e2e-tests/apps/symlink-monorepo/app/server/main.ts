import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { packageValue } from 'meteor/symlink-e2e-package';
import { serverRootImportValue } from '/imports/root-imports/server';
import { moduleValue } from '../imports/symlinked-module';
import { sourceDirValue } from '../imports/symlinked-dir';
import { getRelativePayload } from './symlinked/shared-file';

declare const Assets: {
  getTextAsync(assetPath: string): Promise<string>;
};

async function getServerPayload() {
  const relativePayload = getRelativePayload('server');
  const privateAsset = await Assets.getTextAsync('linked-private/symlink-private.txt');

  return {
    relativeValue: relativePayload.value,
    relativePeer: relativePayload.peer,
    relativeLocation: relativePayload.location,
    sourceDirValue,
    moduleValue,
    packageValue,
    rootImportValue: serverRootImportValue,
    privateAsset: privateAsset.trim(),
  };
}

Meteor.startup(async () => {
  const payload = await getServerPayload();
  console.log(`SYMLINK_E2E_SERVER_PAYLOAD ${JSON.stringify(payload)}`);
});

WebApp.handlers.get('/__symlink-e2e', async (_req, res) => {
  const payload = await getServerPayload();
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(payload));
});
