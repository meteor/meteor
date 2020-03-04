import { getNativeStoresInfo } from './native';

export const appleAppSiteAssociation = (req, res) => {
  // if you have multiple apps using the same backend you can customize here
  // the color, name, description, etc using the req.headers
  const nativeStoresInfo = getNativeStoresInfo();

  if (!nativeStoresInfo.nativeAppEnabled) {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(405);
    res.end(`<h1>Native App not enabled</h1>`);
    return;
  }
  if (!nativeStoresInfo.appleTeamId || !nativeStoresInfo.appleItunesAppId) {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(405);
    res.end(
      `<h1>Apple iTunes App ID and Apple Prefix are not configured</h1>`
    );
    return;
  }

  const appSiteAssociation = {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${nativeStoresInfo.appleTeamId}.${nativeStoresInfo.appleBundleId}`,
          paths: ['*'],
        },
      ],
    },
  };

  res.setHeader('Content-Type', 'application/json');
  res.writeHead(200);
  res.end(JSON.stringify(appSiteAssociation));
};
