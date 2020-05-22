import {onPageLoad} from 'meteor/server-render';

import {
  DESCRIPTION, KEYWORDS, LOGO_URL_WITHOUT_EXT, NAME,
} from './constants';
import {getPwaSettings} from "./pwa-json";
import {addGoogleAnalyticsScript} from "./google-analytics";
import {APPLE_ITUNES_APP_ID} from "./native";

export const getBaseUrlFromHeaders = headers => {
  const protocol = headers['x-forwarded-proto'];
  const {host} = headers;
  // we need to have '//' to findOneByHost work as expected
  return `${protocol ? `${protocol}:` : ''}//${host}`;
};

export const getContext = sink => {
  const {headers, url, browser} = sink.request;

  const baseUrl = getBaseUrlFromHeaders(headers);

  // optionally you can check bots here for example for galaxybot requests
  // we can ignore
  if (browser && browser.name === 'galaxybot') {
    return null;
  }

  // you can also use url.path or url.pathname to return specific tags for
  // specific pages

  // when we are running inside cordova maybe you also want to ignore meta tags
  if (url && url.pathname && url.pathname.includes('cordova/')) {
    return null;
  }

  try {
    // you can return here specific data based in the request
    return {baseUrl};
    // it's important to catch any errors here to not break the initial render
  } catch (e) {
    console.error(`Error trying to get details from URL ${url.path}`, e);
    return {baseUrl};
  }
};

const getTags = context => {
  // if you have different responses for different urls you can get it here
  // and then return different values
  const {baseUrl} = context;

  return {
    title: NAME,
    description: DESCRIPTION,
    image: `${LOGO_URL_WITHOUT_EXT}.png`,
    logoUrl: `${LOGO_URL_WITHOUT_EXT}.png`,
    iconUrl: `${LOGO_URL_WITHOUT_EXT}.png`,
    screenUrl: `${LOGO_URL_WITHOUT_EXT}.png`,
    url: baseUrl,
    keywords: KEYWORDS.filter(Boolean).join(', '),
  };
};

const appendMetaTags = (sink, metaTags) => {
  Object.keys(metaTags).forEach(key => {
    const value = metaTags[key];
    if (!value) {
      return;
    }
    switch (key) {
      case 'title':
        sink.appendToHead(`<title>${value}</title>\n`);
        sink.appendToHead(`<meta property="og:title" content="${value}">\n`);
        sink.appendToHead(
          `<meta property="twitter:title" content="${value}">\n`
        );
        break;
      case 'description':
        sink.appendToHead(`<meta property="description" content="${value}">\n`);
        sink.appendToHead(
          `<meta property="og:description" content="${value}">\n`
        );
        sink.appendToHead(
          `<meta property="twitter:description" content="${value}">\n`
        );
        sink.appendToHead(
          `<meta property="twitter:image:alt" content="${value}">\n`
        );
        break;
      case 'image':
        sink.appendToHead(`<meta property="og:image" content="${value}">\n`);
        sink.appendToHead(
          `<meta property="og:image:alt" content="${value}">\n`
        );
        sink.appendToHead(
          `<meta property="og:image:secure_url" content="${value}">\n`
        );
        sink.appendToHead(
          `<meta property="twitter:image" content="${value}">\n`
        );
        sink.appendToHead(
          '<meta name="twitter:card" content="summary_large_image">\n'
        );
        break;
      case 'url':
        sink.appendToHead(`<meta property="twitter:url" content="${value}">\n`);
        sink.appendToHead(`<meta property="og:url" content="${value}">\n`);
        break;
      default:
        sink.appendToHead(`<meta property="${key}" content="${value}">\n`);
    }
  });
};

const appendAppTags = (sink, {baseUrl} = {}) => {
  const {name, theme_color: themeColor, icons} = getPwaSettings();
  const appleItunesAppId = APPLE_ITUNES_APP_ID;
  const iconUrl = icons && icons.length && icons[0].src;
  const screenUrl = iconUrl;

  if (appleItunesAppId) {
    sink.appendToHead(
      `<meta name="apple-itunes-app" content="app-id=${appleItunesAppId}, app-argument=${baseUrl}">\n`
    );
  }
  sink.appendToHead(
    `<meta name="apple-mobile-web-app-title" content="${name}">\n`
  );
  sink.appendToHead(
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n'
  );
  sink.appendToHead(`<meta name="theme-color" content="${themeColor}">\n`);

  sink.appendToHead(
    `<link rel="apple-touch-startup-image" href="${screenUrl}">\n`
  );
  sink.appendToHead(`<link rel="apple-touch-icon" href="${iconUrl}">\n`);
};

onPageLoad(sink => {
  try {
    addGoogleAnalyticsScript(sink);

    const context = getContext(sink);
    if (!context) {
      return;
    }
    const tags = getTags(context);
    appendMetaTags(sink, tags);
    appendAppTags(sink, context);
  } catch (e) {
    console.error('Error trying to generate initial HTML', e);
  }
});
