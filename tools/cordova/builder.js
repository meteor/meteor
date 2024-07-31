import _ from 'underscore';
import url from 'url';
import { Console } from '../console/console.js';
import buildmessage from '../utils/buildmessage.js';
import files from '../fs/files';
import { optimisticReadJsonOrNull } from "../fs/optimistic";
import release from '../packaging/release.js';
import { loadIsopackage } from '../tool-env/isopackets.js';
import utils from '../utils/utils.js';
import XmlBuilder from 'xmlbuilder2';

import { CORDOVA_ARCH, SWIFT_VERSION } from './index.js';

// Hard-coded size constants

const iconsIosSizes = {
  'app_store': '1024x1024',
  'iphone_2x': '120x120',
  'iphone_3x': '180x180',
  'ipad_2x': '152x152',
  'ipad_pro': '167x167',
  'ios_settings_2x': '58x58',
  'ios_settings_3x': '87x87',
  'ios_spotlight_2x': '80x80',
  'ios_spotlight_3x': '120x120',
  'ios_notification_2x': '40x40',
  'ios_notification_3x': '60x60',
  // Legacy
  'ipad': '76x76',
  'ios_settings': '29x29',
  'ios_spotlight': '40x40',
  'ios_notification': '20x20',
  'iphone_legacy': '57x57',
  'iphone_legacy_2x': '114x114',
  'ipad_spotlight_legacy': '50x50',
  'ipad_spotlight_legacy_2x': '100x100',
  'ipad_app_legacy': '72x72',
  'ipad_app_legacy_2x': '144x144'
};

const iconsAndroidSizes = {
  'android_mdpi': '48x48',
  'android_hdpi': '72x72',
  'android_xhdpi': '96x96',
  'android_xxhdpi': '144x144',
  'android_xxxhdpi': '192x192'
};

const splashIosKeys = {
  'ios_universal': 'Default@2x~universal~anyany.png',
  'ios_universal_3x': 'Default@3x~universal~anyany.png',
  'Default@2x~universal~comany': 'Default@2x~universal~comany.png',
  'Default@2x~universal~comcom': 'Default@2x~universal~comcom.png',
  'Default@3x~universal~anycom': 'Default@3x~universal~anycom.png',
  'Default@3x~universal~comany': 'Default@3x~universal~comany.png',
  'Default@2x~iphone~anyany': 'Default@2x~iphone~anyany.png',
  'Default@2x~iphone~comany': 'Default@2x~iphone~comany.png',
  'Default@2x~iphone~comcom': 'Default@2x~iphone~comcom.png',
  'Default@3x~iphone~anyany': 'Default@3x~iphone~anyany.png',
  'Default@3x~iphone~anycom': 'Default@3x~iphone~anycom.png',
  'Default@3x~iphone~comany': 'Default@3x~iphone~comany.png',
  'Default@2x~ipad~anyany': 'Default@2x~ipad~anyany.png',
  'Default@2x~ipad~comany': 'Default@2x~ipad~comany.png'
};

const splashAndroidKeys = {
  'android_universal': 'AndroidWindowSplashScreenAnimatedIcon',
};

export class CordovaBuilder {
  constructor(projectContext, projectRoot, options) {
    this.projectContext = projectContext;
    this.projectRoot = projectRoot;
    this.options = options;

    this.resourcesPath = files.pathJoin(
      this.projectRoot,
      'resources');

    this.initalizeDefaults();
  }

  static createCordovaServerPort(appIdentifier) {
    // Convert the appId (a base 36 string) to a number
    const appIdAsNumber = parseInt(appIdentifier, 36);
    // We use the appId to choose a local server port between 12000-13000.
    // This range should be large enough to avoid collisions with other
    // Meteor apps, and has also been chosen to avoid collisions
    // with other apps or services on the device (although this can never be
    // guaranteed).
    return 12000 + (appIdAsNumber % 1000);
  }

  initalizeDefaults() {
    let { cordovaServerPort } = this.options;
    // if --cordova-server-port is not present on run command
    if (!cordovaServerPort) {
      cordovaServerPort = CordovaBuilder.createCordovaServerPort(
        this.projectContext.appIdentifier
      );
    }

    this.metadata = {
      id: 'com.id' + this.projectContext.appIdentifier,
      version: '0.0.1',
      buildNumber: undefined,
      name: files.pathBasename(this.projectContext.projectDir),
      description: 'New Meteor Mobile App',
      author: 'A Meteor Developer',
      email: 'n/a',
      website: 'n/a',
      contentUrl: `http://localhost:${cordovaServerPort}/`
    };

    // Set some defaults different from the Cordova defaults
    this.additionalConfiguration = {
      global: {
        'webviewbounce': false,
        'DisallowOverscroll': true,
        'WKWebViewOnly': true,
        'SwiftVersion': SWIFT_VERSION
      },
      platform: {
        ios: {},
        android: {
          "AndroidXEnabled": true,
          // We still use a port based on appId on iOS to avoid conflits on local webserver.
          // We don't need it on android, but the contentUrl can only be one, and we set this
          // here to be able to intercept these calls.
          "hostname": `localhost:${cordovaServerPort}`,
          "AndroidInsecureFileModeEnabled": true
        }
      }
    };

    // Custom elements that will be appended into config.xml's widgets
    this.custom = [];

    // Resource files that will be appended to platform bundle and config.xml
    this.resourceFiles = [];

    const packageMap = this.projectContext.packageMap;

    if (packageMap && packageMap.getInfo('mobile-status-bar')) {
      this.additionalConfiguration.global.StatusBarOverlaysWebView = false;
      this.additionalConfiguration.global.StatusBarStyle = 'default';
    }

    // Default access rules.
    // Rules can be extended with App.accessRule() in mobile-config.js.
    this.accessRules = {
      // Allow the app to ask the system to open these types of URLs.
      // (e.g. in the phone app or an email client)
      'tel:*': { type: 'intent' },
      'geo:*': { type: 'intent' },
      'mailto:*': { type: 'intent' },
      'sms:*': { type: 'intent' },
      'market:*': { type: 'intent' },
      'itms:*': { type: 'intent' },
      'itms-apps:*': { type: 'intent' },

      // Allow navigation to localhost, which is needed for the local server
      'http://localhost': { type: 'navigation' }
    };

    const mobileServerUrl = this.options.mobileServerUrl;
    const serverDomain = mobileServerUrl ?
      utils.parseUrl(mobileServerUrl).hostname : null;

    // If the remote server domain is known, allow access to it for XHR and DDP
    // connections.
    if (serverDomain) {
      // Application Transport Security (new in iOS 9) doesn't allow you
      // to give access to IP addresses (just domains). So we allow access to
      // everything if we don't have a domain, which sets NSAllowsArbitraryLoads.
      if (utils.isIPv4Address(serverDomain)) {
        this.accessRules['*'] = { type: 'network' };
      } else {
        this.accessRules['*://' + serverDomain] = { type: 'network' };

        // Android talks to localhost over 10.0.2.2. This config file is used for
        // multiple platforms, so any time that we say the server is on localhost we
        // should also say it is on 10.0.2.2.
        if (serverDomain === 'localhost') {
          this.accessRules['*://10.0.2.2'] = { type: 'network' };
        }
      }
    }

    this.imagePaths = {
      icon: {},
      splash: {}
    };

    // Defaults are Meteor meatball images located in tools/cordova/assets directory
    const assetsPath = files.pathJoin(__dirname, 'assets');
    const iconsPath = files.pathJoin(assetsPath, 'icons');
    const launchScreensPath = files.pathJoin(assetsPath, 'launchscreens');

    const setDefaultIcon = (size, name) => {
      const imageFile = files.pathJoin(iconsPath, size + '.png');
      if (files.exists(imageFile)) {
        this.imagePaths.icon[name] = imageFile;
      }
    };

    const setDefaultLaunchScreen = (key) => {
      const imageFile = files.pathJoin(launchScreensPath, `${key}.png`);
      if (files.exists(imageFile)) {
        this.imagePaths.splash[key] = imageFile;
      }
    };

    _.each(iconsIosSizes, setDefaultIcon);
    _.each(iconsAndroidSizes, setDefaultIcon);

    setDefaultLaunchScreen('ios_universal');
    setDefaultLaunchScreen('android_universal');

    this.pluginsConfiguration = {};
  }

  processControlFile() {
    const controlFilePath =
      files.pathJoin(this.projectContext.projectDir, 'mobile-config.js');


    if (files.exists(controlFilePath)) {
      Console.debug('Processing mobile-config.js');

      buildmessage.enterJob({ title: `processing mobile-config.js` }, () => {
        const code = files.readFile(controlFilePath, 'utf8');

        try {
          files.runJavaScript(code, {
            filename: 'mobile-config.js',
            symbols: { App: createAppConfiguration(this) }
          });
        } catch (error) {
          buildmessage.exception(error);
        }
      });
    }
  }

  writeConfigXmlAndCopyResources(shouldCopyResources = true) {
    let config = XmlBuilder.create({ version: '1.0' }).ele('widget');

    // Set the root attributes
    _.each({
      id: this.metadata.id,
      version: this.metadata.version,
      'android-versionCode': this.metadata.buildNumber,
      'ios-CFBundleVersion': this.metadata.buildNumber,
      xmlns: 'http://www.w3.org/ns/widgets',
      'xmlns:cdv': 'http://cordova.apache.org/ns/1.0',
      'xmlns:android': 'http://schemas.android.com/apk/res/android'
    }, (value, key) => {
      if (value) {
        config.att(key, value);
      }
    });

    // Set the metadata
    config.ele('name').txt(this.metadata.name);
    config.ele('description').txt(this.metadata.description);
    config.ele('author', {
      href: this.metadata.website,
      email: this.metadata.email
    }).txt(this.metadata.author);

    // Set the additional global configuration preferences
    _.each(this.additionalConfiguration.global, (value, key) => {
      config.ele('preference', {
        name: key,
        value: value.toString()
      });
    });

    // Set custom tags into widget element
    _.each(this.custom, elementSet => {
      const tag = config.ele(elementSet);
    });

    config.ele('content', { src: this.metadata.contentUrl });

    // Copy all the access rules
    _.each(this.accessRules, (options, pattern) => {
      const type = options.type;
      options = _.omit(options, 'type');

      if (type === 'intent') {
        config.ele('allow-intent', { href: pattern });
      } else if (type === 'navigation') {
        config.ele('allow-navigation', Object.assign({ href: pattern }, options));
      } else {
        config.ele('access', Object.assign({ origin: pattern }, options));
      }
    });

    const platformElement = {
      ios: config.ele('platform', { name: 'ios' }),
      android: config.ele('platform', { name: 'android' })
    }

    // Set the additional platform-specific configuration preferences
    _.each(this.additionalConfiguration.platform, (prefs, platform) => {
      _.each(prefs, (value, key) => {
        platformElement[platform].ele('preference', {
          name: key,
          value: value.toString()
        });
      });
    });

    // allow http communication only in development mode
    if(process.env.NODE_ENV !== 'production') {
      platformElement.android.ele("edit-config")
          .att("file", "app/src/main/AndroidManifest.xml")
          .att("mode", "merge")
          .att("target", "/manifest/application")
          .ele("application")
          .att("android:usesCleartextTraffic", "true");
    }
    if (shouldCopyResources) {
      // Prepare the resources folder
      files.rm_recursive(this.resourcesPath);
      files.mkdir_p(this.resourcesPath);

      Console.debug('Copying resources for mobile apps');

      this._configureAndCopyIcon(iconsIosSizes, platformElement.ios);
      this._configureAndCopyIcon(iconsAndroidSizes, platformElement.android);
      this._configureAndCopySplashImages(splashIosKeys, platformElement.ios, true);
      this._configureAndCopySplashImages(splashAndroidKeys, platformElement.android);
    }

    this.configureAndCopyResourceFiles(
      this.resourceFiles,
      platformElement.ios,
      platformElement.android
    );

    Console.debug('Writing new config.xml');

    const configXmlPath = files.pathJoin(this.projectRoot, 'config.xml');
    const formattedXmlConfig = config.end({ prettyPrint: true });
    files.writeFile(configXmlPath, formattedXmlConfig, 'utf8');
  }

  _copyImageToBuildFolderAndAppendToXmlNode(suppliedPath, newFilename, xmlElement, tag, attributes = {}, isIos = false) {
    // will only change for the tag splash for preference in android.
    const isAndroid = !isIos;
    if (tag === 'splash' && isAndroid) {
      return
      Console.labelWarn('Android launch screens are no longer supported. Please use App.setPreference("AndroidWindowSplashScreenAnimatedIcon", "path/to/file", "android"). Visit https://cordova.apache.org/docs/en/latest/core/features/splashscreen/index.html#android-specific-information.')
    }

    const src = files.pathJoin('resources', newFilename);

    files.copyFile(
        files.pathResolve(this.projectContext.projectDir, suppliedPath),
        files.pathJoin(this.resourcesPath, newFilename));

    // Set it to the xml tree
    xmlElement.ele(tag, { ...(tag === "preference" ? { value: src } : { src }), ...attributes });
  }

  _resolveFilenameForImages = (suppliedPath, key, tag) => {
    const suppliedFilename = _.last(suppliedPath.split(files.pathSep));
    let extension = _.last(suppliedFilename.split('.'));

    // XXX special case for 9-patch png's
    if (suppliedFilename.match(/\.9\.png$/)) {
      extension = '9.png';
    }

    return `${key}.${tag}.${extension}`;
  }

  _configureAndCopyIcon(sizes, xmlElement) {
    if (!sizes || !xmlElement) {
      throw new Error("Invalid parameters")
    }

    Object.entries(sizes).forEach(([key, size]) => {
      const suppliedPath = this.imagePaths['icon'][key];
      if (!suppliedPath) return;

      const [width, height] = size.split('x');
      const filename = this._resolveFilenameForImages(suppliedPath, key, 'icon');
      this._copyImageToBuildFolderAndAppendToXmlNode(suppliedPath, filename, xmlElement, 'icon', { width, height })
    })
  }

  _configureAndCopySplashImages(allowedValues, xmlElement, isIos = false) {
    const appendDarkMode = (stringValue , { separator = '.', withChar = '~' } = {}) => {
      if (!stringValue) {
        throw new Error("No string was passed.");
      }

      const darkModeIdentifier = isIos ? 'dark' : 'night';
      const lastIndexOfSeparator = stringValue.lastIndexOf(separator);

      if (!lastIndexOfSeparator) {
        throw new Error("Invalid src value!");
      }

      return `${stringValue.substring(0, lastIndexOfSeparator)}${withChar}${darkModeIdentifier}${stringValue.substring(lastIndexOfSeparator)}`;
    }

    Object.entries(allowedValues).forEach(([key, value]) => {
      const suppliedValue = this.imagePaths['splash'][key];
      if (!suppliedValue) return;

      let suppliedPath = suppliedValue;
      let suppliedPathDarkMode = null;
      if (typeof suppliedValue === 'object') {
        if (isIos) {
          suppliedPath = suppliedValue.src;
          suppliedPathDarkMode = suppliedValue.srcDarkMode;
        } else {
         throw new Error("Dark mode through Meteor's launch screen helper is only allowed for iOS. For android, please follow the instructions: https://developer.android.com/develop/ui/views/theming/darktheme.");
        }
      }

      if (isIos) {
        if (suppliedPathDarkMode) {
          this._copyImageToBuildFolderAndAppendToXmlNode(suppliedPathDarkMode,
              appendDarkMode(value),
              xmlElement,
              'splash',
              {},
              isIos);
        }
        this._copyImageToBuildFolderAndAppendToXmlNode(suppliedPath,
            value,
            xmlElement,
            'splash',
            {},
            isIos);
        return;
      }

      const filename = this._resolveFilenameForImages(suppliedPath, key, 'splash');

      this._copyImageToBuildFolderAndAppendToXmlNode(suppliedPath,
        filename,
        xmlElement,
        'settings',
        { name: value },
        isIos);
    });
  }

  configureAndCopyResourceFiles(resourceFiles, iosElement, androidElement) {
    _.each(resourceFiles, resourceFile => {
      // Copy resource files in cordova project root ./resource-files directory keeping original absolute path
      var filepath = files.pathResolve(this.projectContext.projectDir, resourceFile.src);
      files.copyFile(
        filepath,
        files.pathJoin(this.projectRoot, "resource-files", filepath));
      // And entry in config.xml
      if (!resourceFile.platform ||
          (resourceFile.platform && resourceFile.platform === "android")) {
        androidElement.ele('resource-file', {
          src: files.pathJoin("resource-files", filepath),
          target: resourceFile.target
        });
      }
      if (!resourceFile.platform ||
          (resourceFile.platform && resourceFile.platform === "ios")) {
        iosElement.ele('resource-file', {
          src: files.pathJoin("resource-files", filepath),
          target: resourceFile.target
        });
      }
    });
  }

  copyWWW(bundlePath) {
    const wwwPath = files.pathJoin(this.projectRoot, 'www');

    // Remove existing www
    files.rm_recursive(wwwPath);

    // Create www and www/application directories
    const applicationPath = files.pathJoin(wwwPath, 'application');
    files.mkdir_p(applicationPath);

    // Copy Cordova arch program from bundle to www/application
    const programPath = files.pathJoin(bundlePath, 'programs', CORDOVA_ARCH);
    files.cp_r(programPath, applicationPath);

    // Load program.json
    const programJsonPath = files.convertToOSPath(
      files.pathJoin(applicationPath, 'program.json'));
    const program = JSON.parse(files.readFile(programJsonPath, 'utf8'));

    // Load settings
    const settingsFile = this.options.settingsFile;
    const settings = settingsFile ?
      JSON.parse(files.readFile(settingsFile, 'utf8')) : {};
    const publicSettings = settings['public'];

    // Calculate client hash and append to program
    this.appendVersion(program, publicSettings);

    // Write program.json
    files.writeFile(programJsonPath, JSON.stringify(program), 'utf8');

    const bootstrapPage = this.generateBootstrapPage(
      applicationPath, program, publicSettings
    ).await();

    files.writeFile(files.pathJoin(applicationPath, 'index.html'),
      bootstrapPage, 'utf8');
  }

  appendVersion(program, publicSettings) {
    // Note: these version calculations must be kept in agreement with
    // generateClientProgram in packages/webapp/webapp_server.js, or hot
    // code push will reload the app unnecessarily.

    let configDummy = {};
    configDummy.PUBLIC_SETTINGS = publicSettings || {};

    const { WebAppHashing } = loadIsopackage('webapp-hashing');
    const { AUTOUPDATE_VERSION } = process.env;

    program.version = AUTOUPDATE_VERSION ||
      WebAppHashing.calculateClientHash(
        program.manifest, null, configDummy);

    program.versionRefreshable = AUTOUPDATE_VERSION ||
      WebAppHashing.calculateClientHash(
        program.manifest, type => type === "css", configDummy);

    program.versionNonRefreshable = AUTOUPDATE_VERSION ||
      WebAppHashing.calculateClientHash(
        program.manifest,
        (type, replaceable) => type !== "css" && !replaceable,
        configDummy
      );

    program.versionReplaceable = AUTOUPDATE_VERSION ||
      WebAppHashing.calculateClientHash(
        program.manifest,
        (_type, replaceable) => replaceable,
        configDummy
      );
  }

  generateBootstrapPage(applicationPath, program, publicSettings) {
    const meteorRelease =
      release.current.isCheckout() ? "none" : release.current.name;
    const hmrVersion =
      this.options.buildMode === 'development' ? Date.now() : undefined

    const manifest = program.manifest;

    const mobileServerUrl = this.options.mobileServerUrl;

    const parsedUrl = url.parse(mobileServerUrl);

    const runtimeConfig = {
      meteorRelease: meteorRelease,
      gitCommitHash: process.env.METEOR_GIT_COMMIT_HASH || files.findGitCommitHash(applicationPath),
      ROOT_URL: mobileServerUrl,
      // XXX propagate it from this.options?
      ROOT_URL_PATH_PREFIX: parsedUrl.pathname.replace(/\/$/,"") || '',
      DDP_DEFAULT_CONNECTION_URL: process.env.DDP_DEFAULT_CONNECTION_URL || mobileServerUrl,
      autoupdate: {
        versions: {
          "web.cordova": {
            version: program.version,
            versionRefreshable: program.versionRefreshable,
            versionNonRefreshable: program.versionNonRefreshable,
            versionReplaceable: program.versionReplaceable,
            versionHmr: hmrVersion
          }
        }
      },
      appId: this.projectContext.appIdentifier,
      meteorEnv: {
        NODE_ENV: process.env.NODE_ENV || "production",
        TEST_METADATA: process.env.TEST_METADATA || "{}"
      }
    };

    if (publicSettings) {
      runtimeConfig.PUBLIC_SETTINGS = publicSettings;
    }

    const { Boilerplate } = loadIsopackage('boilerplate-generator');

    const boilerplate = new Boilerplate(CORDOVA_ARCH, manifest, {
      urlMapper: _.identity,
      pathMapper: (path) => files.convertToOSPath(
        files.pathJoin(applicationPath, path)),
      baseDataExtension: {
        meteorRuntimeConfig: JSON.stringify(
          encodeURIComponent(JSON.stringify(runtimeConfig)))
      }
    });

    return boilerplate.toHTMLAsync();
  }

  copyBuildOverride() {
    const buildOverridePath =
      files.pathJoin(this.projectContext.projectDir, 'cordova-build-override');

    if (files.exists(buildOverridePath) &&
      files.stat(buildOverridePath).isDirectory()) {
      Console.debug('Copying over the cordova-build-override directory');
      files.cp_r(buildOverridePath, this.projectRoot);
    }
  }
}

function createAppConfiguration(builder) {
  const { settingsFile } = builder.options;
  let settings = null;
  if (settingsFile) {
    settings = optimisticReadJsonOrNull(settingsFile);
    if (!settings) {
      throw new Error("Unreadable --settings file: " + settingsFile);
    }
  }

  /**
   * @namespace App
   * @global
   * @summary The App configuration object in mobile-config.js
   */
  return {
    /**
     * @summary Set your mobile app's core configuration information.
     * @param {Object} options
     * @param {String} [options.id,version,name,description,author,email,website]
     * Each of the options correspond to a key in the app's core configuration
     * as described in the [Cordova documentation](http://cordova.apache.org/docs/en/5.1.1/config_ref_index.md.html#The%20config.xml%20File_core_configuration_elements).
     * @memberOf App
     */
    info: function (options) {
      // check that every key is meaningful
      _.each(options, function (value, key) {
        if (!_.has(builder.metadata, key)) {
          throw new Error("Unknown key in App.info configuration: " + key);
        }
      });

      Object.assign(builder.metadata, options);
    },
    /**
     * @summary Add a preference for your build as described in the
     * [Cordova documentation](http://cordova.apache.org/docs/en/5.1.1/config_ref_index.md.html#The%20config.xml%20File_global_preferences).
     * @param {String} name A preference name supported by Cordova's
     * `config.xml`.
     * @param {String} value The value for that preference.
     * @param {String} [platform] Optional. A platform name (either `ios` or `android`) to add a platform-specific preference.
     * @memberOf App
     */
    setPreference: function (key, value, platform) {
      if (platform) {
        if (!['ios', 'android'].includes(platform)) {
          throw new Error(`Unknown platform in App.setPreference: ${platform}. \
Valid platforms are: ios, android.`);
        }

        builder.additionalConfiguration.platform[platform][key] = value;
      } else {
        builder.additionalConfiguration.global[key] = value;
      }
    },

    /**
     * @summary Like `Meteor.settings`, contains data read from a JSON
     *          file provided via the `--settings` command-line option at
     *          build time, or null if no settings were provided.
     * @memberOf App
     * @type {Object}
     */
    settings,

    /**
     * @summary Set the build-time configuration for a Cordova plugin.
     * @param {String} id The identifier of the plugin you want to
     * configure.
     * @param {Object} config A set of key-value pairs which will be passed
     * at build-time to configure the specified plugin.
     * @memberOf App
     */
    configurePlugin: function (id, config) {
      builder.pluginsConfiguration[id] = config;
    },

    /**
     * @summary Set the icons for your mobile app.
     * @param {Object} icons An Object where the keys are different
     * devices and screen sizes, and values are image paths
     * relative to the project root directory.
     *
     * Valid key values:
     * - `app_store` (1024x1024) // Apple App Store
     * - `iphone_2x` (120x120) // iPhone 5, SE, 6, 6s, 7, 8
     * - `iphone_3x` (180x180) // iPhone 6 Plus, 6s Plus, 7 Plus, 8 Plus, X
     * - `ipad_2x` (152x152) // iPad, iPad mini
     * - `ipad_pro` (167x167) // iPad Pro
     * - `ios_settings_2x` (58x58) // iPhone 5, SE, 6, 6s, 7, 8, iPad, mini, Pro
     * - `ios_settings_3x` (87x87) // iPhone 6 Plus, 6s Plus, 7 Plus, 8 Plus, X
     * - `ios_spotlight_2x` (80x80) // iPhone 5, SE, 6, 6s, 7, 8, iPad, mini, Pro
     * - `ios_spotlight_3x` (120x120) // iPhone 6 Plus, 6s Plus, 7 Plus, 8 Plus, X
     * - `ios_notification_2x` (40x40) // iPhone 5, SE, 6, 6s, 7, 8, iPad, mini, Pro
     * - `ios_notification_3x` (60x60 // iPhone 6 Plus, 6s Plus, 7 Plus, 8 Plus, X
     * - `ipad` (76x76) // Legacy
     * - `ios_settings` (29x29) // Legacy
     * - `ios_spotlight` (40x40) // Legacy
     * - `ios_notification` (20x20) // Legacy
     * - `iphone_legacy` (57x57) // Legacy
     * - `iphone_legacy_2x` (114x114) // Legacy
     * - `ipad_spotlight_legacy` (50x50) // Legacy
     * - `ipad_spotlight_legacy_2x` (100x100) // Legacy
     * - `ipad_app_legacy` (72x72) // Legacy
     * - `ipad_app_legacy_2x` (144x144) // Legacy
     * - `android_mdpi` (48x48)
     * - `android_hdpi` (72x72)
     * - `android_xhdpi` (96x96)
     * - `android_xxhdpi` (144x144)
     * - `android_xxxhdpi` (192x192)
     * @memberOf App
     */
    icons: function (icons) {
      var validDevices =
        Object.keys(iconsIosSizes).concat(Object.keys(iconsAndroidSizes));
      _.each(icons, function (value, key) {
        if (!_.include(validDevices, key)) {
          Console.labelWarn(`${key}: unknown key in App.icons \
configuration. The key may be deprecated.`);
        }
      });
      Object.assign(builder.imagePaths.icon, icons);
    },

    /**
     * @summary Set the launch screen images for your mobile app.
     * @param {Object} launchScreens A dictionary where keys are different
     * devices, screen sizes, and orientations, and the values are image paths
     * relative to the project root directory or an object containing a dark mode image path too `{ src, srcDarkMode }` (iOS only).
     * Note: If you want to have a dark theme splash screen on Android, please follow the instructions described [here](https://developer.android.com/develop/ui/views/theming/darktheme).
     *
     * For Android specific information, check the [Cordova docs](https://cordova.apache.org/docs/en/latest/core/features/splashscreen/index.html#android-specific-information) and [Android docs](https://developer.android.com/develop/ui/views/launch/splash-screen#splash_screen_dimensions).
     * Also note that for android the asset can either be an XML Vector Drawable or PNG.
     *
     * For best practices when developing a splash image, see the [Apple Guidelines](https://developer.apple.com/design/human-interface-guidelines/ios/visual-design/launch-screen/).
     * To learn more about size classes for iOS, check out the [documentation](https://cordova.apache.org/docs/en/10.x/reference/cordova-plugin-splashscreen/#size-classes) from Cordova.
     *
     * Valid key values:
     *
     * iOS:
     *  - `ios_universal` (Default@2xuniversalanyany.png - 2732x2732 px) - All @2x devices, if device/mode specific is not declared
     *  - `ios_universal_3x` (Default@3xuniversalanyany.png - 2208x2208 px) - All @3x devices, if device/mode specific is not declared
     *  - `Default@2x~universal~comany` (1278x2732 px) - All @2x devices in portrait mode
     *  - `Default@2x~universal~comcom` (1334x750 px) - All @2x devices in landscape (narrow) mode
     *  - `Default@3x~universal~anycom` (2208x1242 px) - All @3x devices in landscape (wide) mode
     *  - `Default@3x~universal~comany` (1242x2208 px) - All @3x devices in portrait mode
     *  - `Default@2x~iphone~anyany` (1334x1334 px) - iPhone SE/6s/7/8/XR
     *  - `Default@2x~iphone~comany` (750x1334 px) - iPhone SE/6s/7/8/XR - portrait mode
     *  - `Default@2x~iphone~comcom` (1334x750 px) - iPhone SE/6s/7/8/XR - landscape (narrow) mode
     *  - `Default@3x~iphone~anyany` (2208x2208 px) - iPhone 6s Plus/7 Plus/8 Plus/X/XS/XS Max
     *  - `Default@3x~iphone~anycom` (2208x1242 px) - iPhone 6s Plus/7 Plus/8 Plus/X/XS/XS Max - landscape (wide) mode
     *  - `Default@3x~iphone~comany` (1242x2208 px) - iPhone 6s Plus/7 Plus/8 Plus/X/XS/XS Max - portrait mode
     *  - `Default@2x~ipad~anyany` (2732x2732 px) - iPad Pro 12.9"/11"/10.5"/9.7"/7.9"
     *  - `Default@2x~ipad~comany` (1278x2732 px) - iPad Pro 12.9"/11"/10.5"/9.7"/7.9" - portrait mode
     *
     * Android:
     *  - `android_universal` (288x288 dp)
     *
     * @memberOf App
     */
    launchScreens: function (launchScreens) {
      const validDevices =
        Object.keys(splashIosKeys).concat(Object.keys(splashAndroidKeys));

      Object.keys(launchScreens).forEach((key) => {
        if (!validDevices.includes(key)) {
          Console.labelWarn(`${key}: unknown key in App.launchScreens \
configuration. The key may be deprecated.`);
        }

        const value = launchScreens[key];
        if (typeof value !== "string" && key.includes("android")) {
          throw new Error("Android splash screen path must be a string. To enable dark splash screens for your app, check out the android developer guide: https://developer.android.com/develop/ui/views/theming/darktheme.");
        }
      });
      Object.assign(builder.imagePaths.splash, launchScreens);
    },

    /**
     * @summary Set a new access rule based on origin domain for your app.
     * By default your application has a limited list of servers it can contact.
     * Use this method to extend this list.
     *
     * Default access rules:
     *
     * - `tel:*`, `geo:*`, `mailto:*`, `sms:*`, `market:*` are allowed and
     *   are handled by the system (e.g. opened in the phone app or an email client)
     * - `http://localhost:*` is used to serve the app's assets from.
     * - The domain or address of the Meteor server to connect to for DDP and
     *   hot code push of new versions.
     *
     * Read more about domain patterns in [Cordova
     * docs](http://cordova.apache.org/docs/en/6.0.0/guide_appdev_whitelist_index.md.html).
     *
     * Starting with Meteor 1.0.4 access rule for all domains and protocols
     * (`<access origin="*"/>`) is no longer set by default due to
     * [certain kind of possible
     * attacks](http://cordova.apache.org/announcements/2014/08/04/android-351.html).
     *
     * @param {String} pattern The pattern defining affected domains or URLs.
     * @param {Object} [options]
     * @param {String} options.type Possible values:
     * - **`'intent'`**: Controls which URLs the app is allowed to ask the system to open.
     *  (e.g. in the phone app or an email client).
     * - **`'navigation'`**: Controls which URLs the WebView itself can be navigated to
     *  (can also needed for iframes).
     * - **`'network'` or undefined**: Controls which network requests (images, XHRs, etc) are allowed to be made.
     * @param {Boolean} options.launchExternal (Deprecated, use `type: 'intent'` instead.)
     * @memberOf App
     */
    accessRule: function (pattern, options) {
      options = options || {};

      if (options.launchExternal) {
        options.type = 'intent';
      }

      builder.accessRules[pattern] = options;
    },

    /**
     * @summary Append custom tags into config's widget element.
     *
     * `App.appendToConfig('<any-xml-content/>');`
     *
     * @param  {String} element The XML you want to include
     * @memberOf App
     */
    appendToConfig: function (xml) {
      builder.custom.push(xml);
    },

    /**
     * @summary Add a resource file for your build as described in the
     * [Cordova documentation](http://cordova.apache.org/docs/en/7.x/config_ref/index.html#resource-file).
     * @param {String} src The project resource path.
     * @param {String} target Resource destination in build.
     * @param {String} [platform] Optional. A platform name (either `ios` or `android`, both if omitted) to add a resource-file entry.
     * @memberOf App
     */
    addResourceFile: function (src, target, platform) {
      builder.resourceFiles.push({
        src: src,
        target: target,
        platform: platform
      });
    }
  };
}
