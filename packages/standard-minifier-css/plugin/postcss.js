let postcssInfo;
let loaded = false;

const missingPostCssError = new Error([
    '',
    `The postcss npm package could not be found in your node_modules`,
    'directory. Please run the following command to install it:',
    '    meteor npm install postcss@8',
    'or disable postcss by removing the postcss config.',
    ''
  ].join('\n'));

export async function loadPostCss() {
  if (loaded) {
    return postcssInfo;
  }

  let loadConfig;
  try {
    loadConfig = require('postcss-load-config');
  } catch (e) {
    // The app doesn't have this package installed
    // Assuming the app doesn't use PostCSS
    loaded = true;

    return;
 }

  let config;
  try {
    config = await loadConfig({ meteor: true });
  } catch (e) {
    if (e.message.includes('No PostCSS Config found in')) {
      // PostCSS is not used by this app
      loaded = true;

      return;
    }

    if (e.message.includes('Cannot find module \'postcss\'')) {
      return { error: missingPostCssError };
    }

    e.message = `While loading postcss config: ${e.message}`;
    return {
      error: e
    };
  }

  let postcss;
  try {
    postcss = require('postcss');
  } catch (e) {
    return { error: missingPostCssError };
  }

  const postcssVersion = require('postcss/package.json').version;
  const major = parseInt(postcssVersion.split('.')[0], 10);
  if (major !== 8) {
    // TODO: should this just be a warning instead?
    const error = new Error([
      '',
      `Found version ${postcssVersion} of postcss in your node_modules`,
      'directory. standard-minifier-css is only compatible with',
      'version 8 of PostCSS. Please restart Meteor after installing',
      'a supported version of PostCSS',
      ''
    ].join('\n'));

    return { error };
  }

  loaded = true;
  postcssInfo = {
    config,
    postcss
  };

  return postcssInfo;
}
