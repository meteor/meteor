import _ from 'underscore';
import util from 'util';
import { Console } from '../console/console.js';
import buildmessage from '../utils/buildmessage.js';
import files from '../fs/files.js';
import bundler from '../isobuild/bundler.js';
import archinfo from '../utils/archinfo.js';
import release from '../packaging/release.js';
import isopackets from '../tool-env/isopackets.js';
import utils from '../utils/utils.js';

import { CORDOVA_ARCH } from './index.js';

// Hard-coded size constants

const iconsIosSizes = {
  'iphone': '60x60',
  'iphone_2x': '120x120',
  'iphone_3x': '180x180',
  'ipad': '76x76',
  'ipad_2x': '152x152'
};

const iconsAndroidSizes = {
  'android_ldpi': '36x36',
  'android_mdpi': '42x42',
  'android_hdpi': '72x72',
  'android_xhdpi': '96x96'
};

const launchIosSizes = {
  'iphone': '320x480',
  'iphone_2x': '640x960',
  'iphone5': '640x1136',
  'iphone6': '750x1334',
  'iphone6p_portrait': '1242x2208',
  'iphone6p_landscape': '2208x1242',
  'ipad_portrait': '768x1004',
  'ipad_portrait_2x': '1536x2008',
  'ipad_landscape': '1024x748',
  'ipad_landscape_2x': '2048x1496'
};

const launchAndroidSizes = {
  'android_ldpi_portrait': '320x426',
  'android_ldpi_landscape': '426x320',
  'android_mdpi_portrait': '320x470',
  'android_mdpi_landscape': '470x320',
  'android_hdpi_portrait': '480x640',
  'android_hdpi_landscape': '640x480',
  'android_xhdpi_portrait': '720x960',
  'android_xhdpi_landscape': '960x720'
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

  initalizeDefaults() {
    this.metadata = {
      id: 'com.id' + this.projectContext.appIdentifier,
      version: '0.0.1',
      buildNumber: undefined,
      name: files.pathBasename(this.projectContext.projectDir),
      description: 'New Meteor Mobile App',
      author: 'A Meteor Developer',
      email: 'n/a',
      website: 'n/a'
    };

    // Set some defaults different from the Cordova defaults
    this.additionalConfiguration = {
      global: {
        'webviewbounce': false,
        'DisallowOverscroll': true,
        'deployment-target': '7.0'
      },
      platform: {
          ios: {},
          android: {}
      }
    };

    const packageMap = this.projectContext.packageMap;

    if (packageMap && packageMap.getInfo('launch-screen')) {
      this.additionalConfiguration.global.AutoHideSplashScreen = false;
      this.additionalConfiguration.global.SplashScreen = 'screen';
      this.additionalConfiguration.global.SplashScreenDelay = 10000;
    }

    if (packageMap && packageMap.getInfo('mobile-status-bar')) {
      this.additionalConfiguration.global.StatusBarOverlaysWebView = false;
      this.additionalConfiguration.global.StatusBarStyle = 'default';
    }

    // Default access rules for plain Meteor-Cordova apps.
    // Rules can be extended with mobile-config API.
    // The value is `true` if the protocol or domain should be allowed,
    // 'external' if should handled externally.
    this.accessRules = {
      // Allow external calls to things like email client or maps app or a
      // phonebook app.
      'tel:*': 'external',
      'geo:*': 'external',
      'mailto:*': 'external',
      'sms:*': 'external',
      'market:*': 'external',

      // phonegap/cordova related protocols
      // "file:" protocol is used to access first files from disk
      'file:*': true,
      'cdv:*': true,
      'gap:*': true,

      // allow Meteor's local emulated server url - this is the url from which the
      // application loads its assets
      'http://meteor.local/*': true
    };

    const mobileServerUrl = this.options.mobileServerUrl;
    const serverDomain = mobileServerUrl ?
      utils.parseUrl(mobileServerUrl).host : null;

    // If the remote server domain is known, allow access to it for xhr and DDP
    // connections.
    if (serverDomain) {
      this.accessRules['*://' + serverDomain + '/*'] = true;
      // Android talks to localhost over 10.0.2.2. This config file is used for
      // multiple platforms, so any time that we say the server is on localhost we
      // should also say it is on 10.0.2.2.
      if (serverDomain === 'localhost') {
        this.accessRules['*://10.0.2.2/*'] = true;
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

    const setIcon = (size, name) => {
      this.imagePaths.icon[name] = files.pathJoin(iconsPath, size + '.png');
    };

    const setLaunchscreen = (size, name) => {
      this.imagePaths.splash[name] =
        files.pathJoin(launchScreensPath, `${size}.png`);
    };

    _.each(iconsIosSizes, setIcon);
    _.each(iconsAndroidSizes, setIcon);
    _.each(launchIosSizes, setLaunchscreen);
    _.each(launchAndroidSizes, setLaunchscreen);

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
    const { XmlBuilder } = isopackets.load('cordova-support')['xmlbuilder'];

    let config = XmlBuilder.create('widget');

    // Set the root attributes
    _.each({
      id: this.metadata.id,
      version: this.metadata.version,
      'android-versionCode': this.metadata.buildNumber,
      'ios-CFBundleVersion': this.metadata.buildNumber,
      xmlns: 'http://www.w3.org/ns/widgets',
      'xmlns:cdv': 'http://cordova.apache.org/ns/1.0'
    }, (value, key) => {
      if (value) {
        config.att(key, value);
      }
    });

    // Set the metadata
    config.element('name').txt(this.metadata.name);
    config.element('description').txt(this.metadata.description);
    config.element('author', {
      href: this.metadata.website,
      email: this.metadata.email
    }).txt(this.metadata.author);

    // Set the additional global configuration preferences
    _.each(this.additionalConfiguration.global, (value, key) => {
      config.element('preference', {
        name: key,
        value: value.toString()
      });
    });

    // Load from index.html by default
    config.element('content', { src: 'index.html' });

    // Copy all the access rules
    _.each(this.accessRules, (rule, pattern) => {
      var opts = { origin: pattern };
      if (rule === 'external') {
        opts['launch-external'] = true;
      }

      config.element('access', opts);
    });

    const platformElement = {
      ios: config.element('platform', {name: 'ios'}),
      android: config.element('platform', {name: 'android'})
    }

    // Set the additional platform-specific configuration preferences
    _.each(this.additionalConfiguration.platform, (prefs, platform) => {
      _.each(prefs, (value, key) => {
        platformElement[platform].element('preference', {
          name: key,
          value: value.toString()
        });
      });
    });

    if (shouldCopyResources) {
      // Prepare the resources folder
      files.rm_recursive(this.resourcesPath);
      files.mkdir_p(this.resourcesPath);

      Console.debug('Copying resources for mobile apps');

      this.configureAndCopyImages(iconsIosSizes, platformElement.ios, 'icon');
      this.configureAndCopyImages(iconsAndroidSizes, platformElement.android, 'icon');
      this.configureAndCopyImages(launchIosSizes, platformElement.ios, 'splash');
      this.configureAndCopyImages(launchAndroidSizes, platformElement.android, 'splash');
    }

    Console.debug('Writing new config.xml');

    const configXmlPath = files.pathJoin(this.projectRoot, 'config.xml');
    const formattedXmlConfig = config.end({ pretty: true });
    files.writeFile(configXmlPath, formattedXmlConfig, 'utf8');
  }

  configureAndCopyImages(sizes, xmlElement, tag) {
    const imageAttributes = (name, width, height, src) => {
      const androidMatch = /android_(.?.dpi)_(landscape|portrait)/g.exec(name);

      let attributes = {
        src: src,
        width: width,
        height: height
      };

      // XXX special case for Android
      if (androidMatch) {
        attributes.density =
          androidMatch[2].substr(0, 4) + '-' + androidMatch[1];
      }

      return attributes;
    };

    _.each(sizes, (size, name) => {
      const [width, height] = size.split('x');

      const suppliedPath = this.imagePaths[tag][name];
      if (!suppliedPath) {
        return;
      }

      const suppliedFilename = _.last(suppliedPath.split(files.pathSep));
      let extension = _.last(suppliedFilename.split('.'));

      // XXX special case for 9-patch png's
      if (suppliedFilename.match(/\.9\.png$/)) {
        extension = '9.png';
      }

      const filename = name + '.' + tag + '.' + extension;
      const src = files.pathJoin('resources', filename);

      // Copy the file to the build folder with a standardized name
      files.copyFile(
        files.pathResolve(this.projectContext.projectDir, suppliedPath),
        files.pathJoin(this.resourcesPath, filename));

      // Set it to the xml tree
      xmlElement.element(tag, imageAttributes(name, width, height, src));

      // XXX reuse one size for other dimensions
      const dups = {
        '60x60': ['29x29', '40x40', '50x50', '57x57', '58x58'],
        '76x76': ['72x72'],
        '152x152': ['144x144'],
        '120x120': ['80x80', '100x100', '114x114'],
        '768x1004': ['768x1024'],
        '1536x2008': ['1536x2048'],
        '1024x748': ['1024x768'],
        '2048x1496': ['2048x1536']
      }[size];

      // just use the same image
      _.each(dups, (size) => {
        const [width, height] = size.split('x');
        // XXX this is fine to not supply a name since it is always iOS, but
        // this is a hack right now.
        xmlElement.element(tag, imageAttributes('n/a', width, height, src));
      });
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

    const bootstrapPage = this.generateBootstrapPage(applicationPath);
    files.writeFile(files.pathJoin(applicationPath, 'index.html'),
      bootstrapPage, 'utf8');

    files.copyFile(
      files.pathJoin(__dirname, 'client', 'meteor_cordova_loader.js'),
      files.pathJoin(wwwPath, 'meteor_cordova_loader.js'));
    files.copyFile(
      files.pathJoin(__dirname, 'client', 'cordova_index.html'),
      files.pathJoin(wwwPath, 'index.html'));
  }

  generateBootstrapPage(applicationPath) {
    const programJsonPath = files.convertToOSPath(
      files.pathJoin(applicationPath, 'program.json'));
    const programJson = JSON.parse(files.readFile(programJsonPath, 'utf8'));
    const manifest = programJson.manifest;

    const settingsFile = this.options.settingsFile;
    const settings = settingsFile ?
      JSON.parse(files.readFile(settingsFile, 'utf8')) : {};
    const publicSettings = settings['public'];

    const meteorRelease =
      release.current.isCheckout() ? "none" : release.current.name;

    let configDummy = {};
    configDummy.PUBLIC_SETTINGS = publicSettings || {};

    const { WebAppHashing } =
      isopackets.load('cordova-support')['webapp-hashing'];
    const calculatedHash =
      WebAppHashing.calculateClientHash(manifest, null, configDummy);

    // XXX partially copied from autoupdate package
    const version = process.env.AUTOUPDATE_VERSION || calculatedHash;

    const mobileServerUrl = this.options.mobileServerUrl;

    const runtimeConfig = {
      meteorRelease: meteorRelease,
      ROOT_URL: mobileServerUrl + "/",
      // XXX propagate it from this.options?
      ROOT_URL_PATH_PREFIX: '',
      DDP_DEFAULT_CONNECTION_URL: mobileServerUrl,
      autoupdateVersionCordova: version,
      appId: this.projectContext.appIdentifier
    };

    if (publicSettings) {
      runtimeConfig.PUBLIC_SETTINGS = publicSettings;
    }

    const { Boilerplate } =
      isopackets.load('cordova-support')['boilerplate-generator'];
    const boilerplate = new Boilerplate(CORDOVA_ARCH, manifest, {
      urlMapper: _.identity,
      pathMapper: (path) => files.convertToOSPath(
        files.pathJoin(applicationPath, path)),
      baseDataExtension: {
        meteorRuntimeConfig: JSON.stringify(
          encodeURIComponent(JSON.stringify(runtimeConfig)))
      }
    });

    return boilerplate.toHTML();
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

      _.extend(builder.metadata, options);
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
        if (!_.contains(['ios', 'android'], platform)) {
          throw new Error(`Unknown platform in App.setPreference: ${platform}. \
Valid platforms are: ios, android.`);
        }

        builder.additionalConfiguration.platform[platform][key] = value;
      } else {
        builder.additionalConfiguration.global[key] = value;
      }
    },

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
     * - `iphone`
     * - `iphone_2x`
     * - `iphone_3x`
     * - `ipad`
     * - `ipad_2x`
     * - `android_ldpi`
     * - `android_mdpi`
     * - `android_hdpi`
     * - `android_xhdpi`
     * @memberOf App
     */
    icons: function (icons) {
      var validDevices =
        _.keys(iconsIosSizes).concat(_.keys(iconsAndroidSizes));
      _.each(icons, function (value, key) {
        if (!_.include(validDevices, key)) {
          throw new Error(key + ": unknown key in App.icons configuration.");
        }
      });
      _.extend(builder.imagePaths.icon, icons);
    },

    /**
     * @summary Set the launch screen images for your mobile app.
     * @param {Object} launchScreens A dictionary where keys are different
     * devices, screen sizes, and orientations, and the values are image paths
     * relative to the project root directory.
     *
     * For Android, launch screen images should
     * be special "Nine-patch" image files that specify how they should be
     * stretched. See the [Android docs](https://developer.android.com/guide/topics/graphics/2d-graphics.html#nine-patch).
     *
     * Valid key values:
     * - `iphone`
     * - `iphone_2x`
     * - `iphone5`
     * - `iphone6`
     * - `iphone6p_portrait`
     * - `iphone6p_landscape`
     * - `ipad_portrait`
     * - `ipad_portrait_2x`
     * - `ipad_landscape`
     * - `ipad_landscape_2x`
     * - `android_ldpi_portrait`
     * - `android_ldpi_landscape`
     * - `android_mdpi_portrait`
     * - `android_mdpi_landscape`
     * - `android_hdpi_portrait`
     * - `android_hdpi_landscape`
     * - `android_xhdpi_portrait`
     * - `android_xhdpi_landscape`
     *
     * @memberOf App
     */
    launchScreens: function (launchScreens) {
      var validDevices =
        _.keys(launchIosSizes).concat(_.keys(launchAndroidSizes));

      _.each(launchScreens, function (value, key) {
        if (!_.include(validDevices, key)) {
          throw new Error(key + ": unknown key in App.launchScreens configuration.");
        }
      });
      _.extend(builder.imagePaths.splash, launchScreens);
    },

    /**
     * @summary Set a new access rule based on origin domain for your app.
     * By default your application has a limited list of servers it can contact.
     * Use this method to extend this list.
     *
     * Default access rules:
     *
     * - `tel:*`, `geo:*`, `mailto:*`, `sms:*`, `market:*` are allowed and
     *   launch externally (phone app, or an email client on Android)
     * - `gap:*`, `cdv:*`, `file:` are allowed (protocols required to access
     *   local file-system)
     * - `http://meteor.local/*` is allowed (a domain Meteor uses to access
     *   app's assets)
     * - The domain of the server passed to the build process (or local ip
     *   address in the development mode) is used to be able to contact the
     *   Meteor app server.
     *
     * Read more about domain patterns in [Cordova
     * docs](http://cordova.apache.org/docs/en/4.0.0/guide_appdev_whitelist_index.md.html).
     *
     * Starting with Meteor 1.0.4 access rule for all domains and protocols
     * (`<access origin="*"/>`) is no longer set by default due to
     * [certain kind of possible
     * attacks](http://cordova.apache.org/announcements/2014/08/04/android-351.html).
     *
     * @param {String} domainRule The pattern defining affected domains or URLs.
     * @param {Object} [options]
     * @param {Boolean} options.launchExternal Set to true if the matching URL
     * should be handled externally (e.g. phone app or email client on Android).
     * @memberOf App
     */
    accessRule: function (domainRule, options) {
      options = options || {};
      options.launchExternal = !!options.launchExternal;
      if (options.launchExternal) {
        builder.accessRules[domainRule] = 'external';
      } else {
        builder.accessRules[domainRule] = true;
      }
    }
  };
}
