import {
  getAppleItunesAppUrl,
  getGoolePlayAppUrl,
  getNativeStoresInfo,
} from './native';
import {
  Colors, DESCRIPTION,
  LANGUAGE,
  LOGO_URL_WITHOUT_EXT,
  NAME,
  SHORT_NAME
} from "./constants";


export const getPwaSettings = () => {
  const logo = LOGO_URL_WITHOUT_EXT;
  const nativeStoresInfo = getNativeStoresInfo();
  const {
    appleItunesAppId,
    googlePlayAppId,
    nativeAppEnabled,
    oneSignalGcmSenderId,
  } = nativeStoresInfo;

  return {
    background_color: Colors.BACKGROUND,
    theme_color: Colors.PRIMARY,
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: LANGUAGE,
    name: NAME,
    short_name: SHORT_NAME,
    description: DESCRIPTION,
    icons: [
      {
        src: `${logo}_128.png`,
        type: 'image/png',
        sizes: '128x128',
      },
      {
        src: `${logo}_152.png`,
        type: 'image/png',
        sizes: '152x152',
      },
      {
        src: `${logo}_144.png`,
        type: 'image/png',
        sizes: '144x144',
      },
      {
        src: `${logo}_192.png`,
        type: 'image/png',
        sizes: '192x192',
      },
      {
        src: `${logo}_512.png`,
        type: 'image/png',
        sizes: '512x512',
      },
    ].filter(icon => !!icon.src),
    gcm_sender_id: oneSignalGcmSenderId,
    prefer_related_applications: nativeAppEnabled,
    related_applications: [
      nativeAppEnabled &&
      googlePlayAppId && {
        platform: 'play',
        url: getGoolePlayAppUrl(nativeStoresInfo),
        id: googlePlayAppId,
      },
      nativeAppEnabled &&
      appleItunesAppId && {
        platform: 'itunes',
        url: getAppleItunesAppUrl(nativeStoresInfo),
        id: appleItunesAppId,
      },
    ].filter(Boolean),
  };
};

export const pwaJson = (req, res) => {
  res.setHeader('Content-Type', 'javascript/json');
  res.writeHead(200);

  // if you have multiple apps using the same backend you can customize here
  // the color, name, description, etc using the req.headers
  const pwa = getPwaSettings();

  res.end(JSON.stringify(pwa));
};
