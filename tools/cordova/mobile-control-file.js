import _ from 'underscore';
import { Console } from '../console.js';
import files from '../fs/files.js';
import isopackets from '../tool-env/isopackets.js'

// Hard-coded constants
var iconIosSizes = {
  'iphone': '60x60',
  'iphone_2x': '120x120',
  'iphone_3x': '180x180',
  'ipad': '76x76',
  'ipad_2x': '152x152'
};

var iconAndroidSizes = {
  'android_ldpi': '36x36',
  'android_mdpi': '42x42',
  'android_hdpi': '72x72',
  'android_xhdpi': '96x96'
};

var launchIosSizes = {
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

var launchAndroidSizes = {
  'android_ldpi_portrait': '320x426',
  'android_ldpi_landscape': '426x320',
  'android_mdpi_portrait': '320x470',
  'android_mdpi_landscape': '470x320',
  'android_hdpi_portrait': '480x640',
  'android_hdpi_landscape': '640x480',
  'android_xhdpi_portrait': '720x960',
  'android_xhdpi_landscape': '960x720'
};

// Given the mobile control file converts it to the Phongep/Cordova project's
// config.xml file and copies the necessary files (icons and launch screens) to
// the correct build location. Replaces all the old resources.
export function processMobileControlFile(controlFilePath, projectContext, cordovaProject, serverDomain) {
  Console.debug('Processing the mobile control file');

  // clean up the previous settings and resources
  files.rm_recursive(files.pathJoin(cordovaProject.projectRoot, 'resources'));

  var code = '';

  if (files.exists(controlFilePath)) {
    // read the file if it exists
    code = files.readFile(controlFilePath, 'utf8');
  }

  var defaultBuildNumber = (Date.now() % 1000000).toString();
  var metadata = {
    id: 'com.id' + projectContext.appIdentifier,
    version: '0.0.1',
    buildNumber: defaultBuildNumber,
    name: cordovaProject.appName,
    description: 'New Meteor Mobile App',
    author: 'A Meteor Developer',
    email: 'n/a',
    website: 'n/a'
  };

  // set some defaults different from the Phonegap/Cordova defaults
  var additionalConfiguration = {
    'webviewbounce': false,
    'DisallowOverscroll': true,
    'deployment-target': '7.0'
  };

  if (projectContext.packageMap.getInfo('launch-screen')) {
    additionalConfiguration.AutoHideSplashScreen = false;
    additionalConfiguration.SplashScreen = 'screen';
    additionalConfiguration.SplashScreenDelay = 10000;
  }

  // Defaults are Meteor meatball images located in tools/cordova/assets directory
  var assetsPath = files.pathJoin(__dirname, 'assets');
  var iconsPath = files.pathJoin(assetsPath, 'icons');
  var launchscreensPath = files.pathJoin(assetsPath, 'launchscreens');
  var imagePaths = {
    icon: {},
    splash: {}
  };

  // Default access rules for plain Meteor-Cordova apps.
  // Rules can be extended with mobile-config API described below.
  // The value is `true` if the protocol or domain should be allowed,
  // 'external' if should handled externally.
  var accessRules = {
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

  // If the remote server domain is known, allow access to it for xhr and DDP
  // connections.
  if (serverDomain) {
    accessRules['*://' + serverDomain + '/*'] = true;
    // Android talks to localhost over 10.0.2.2. This config file is used for
    // multiple platforms, so any time that we say the server is on localhost we
    // should also say it is on 10.0.2.2.
    if (serverDomain === 'localhost') {
      accessRules['*://10.0.2.2/*'] = true;
    }
  }

  var setIcon = function (size, name) {
    imagePaths.icon[name] = files.pathJoin(iconsPath, size + '.png');
  };
  var setLaunch = function (size, name) {
    imagePaths.splash[name] = files.pathJoin(launchscreensPath, size + '.png');
  };

  _.each(iconIosSizes, setIcon);
  _.each(iconAndroidSizes, setIcon);
  _.each(launchIosSizes, setLaunch);
  _.each(launchAndroidSizes, setLaunch);

  /**
   * @namespace App
   * @global
   * @summary The App configuration object in mobile-config.js
   */
  var App = {
    /**
     * @summary Set your mobile app's core configuration information.
     * @param {Object} options
     * @param {String} [options.id,version,name,description,author,email,website]
     * Each of the options correspond to a key in the app's core configuration
     * as described in the [PhoneGap documentation](http://docs.phonegap.com/en/3.5.0/config_ref_index.md.html#The%20config.xml%20File_core_configuration_elements).
     * @memberOf App
     */
    info: function (options) {
      // check that every key is meaningful
      _.each(options, function (value, key) {
        if (!_.has(metadata, key))
          throw new Error("Unknown key in App.info configuration: " + key);
      });

      _.extend(metadata, options);
    },
    /**
     * @summary Add a preference for your build as described in the
     * [PhoneGap documentation](http://docs.phonegap.com/en/3.5.0/config_ref_index.md.html#The%20config.xml%20File_global_preferences).
     * @param {String} name A preference name supported by Phonegap's
     * `config.xml`.
     * @param {String} value The value for that preference.
     * @memberOf App
     */
    setPreference: function (key, value) {
      additionalConfiguration[key] = value;
    },

    /**
     * @summary Set the build-time configuration for a Phonegap plugin.
     * @param {String} pluginName The identifier of the plugin you want to
     * configure.
     * @param {Object} config A set of key-value pairs which will be passed
     * at build-time to configure the specified plugin.
     * @memberOf App
     */
    configurePlugin: function (pluginName, config) {
      pluginsConfiguration[pluginName] = config;
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
        _.keys(iconIosSizes).concat(_.keys(iconAndroidSizes));
      _.each(icons, function (value, key) {
        if (!_.include(validDevices, key))
          throw new Error(key + ": unknown key in App.icons configuration.");
      });
      _.extend(imagePaths.icon, icons);
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
        if (!_.include(validDevices, key))
          throw new Error(key + ": unknown key in App.launchScreens configuration.");
      });
      _.extend(imagePaths.splash, launchScreens);
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
        accessRules[domainRule] = 'external';
      } else {
        accessRules[domainRule] = true;
      }
    }
  };

  try {
    Console.debug('Running the mobile control file');
    files.runJavaScript(code, {
      filename: 'mobile-config.js',
      symbols: { App: App }
    });
  } catch (err) {
    throw new Error('Error reading mobile-config.js:' + err.stack);
  }

  const { XmlBuilder } = isopackets.load('cordova-support')['xmlbuilder'];
  var config = XmlBuilder.create('widget');

  _.each({
    id: metadata.id,
    version: metadata.version,
    'android-versionCode': metadata.buildNumber,
    'ios-CFBundleVersion': metadata.buildNumber,
    xmlns: 'http://www.w3.org/ns/widgets',
    'xmlns:cdv': 'http://cordova.apache.org/ns/1.0'
  }, function (val, key) {
    config.att(key, val);
  });

  // set all the metadata
  config.ele('name').txt(metadata.name);
  config.ele('description').txt(metadata.description);
  config.ele('author', {
    href: metadata.website,
    email: metadata.email
  }).txt(metadata.author);

  // set the additional configuration preferences
  _.each(additionalConfiguration, function (value, key) {
    config.ele('preference', {
      name: key,
      value: value.toString()
    });
  });

  // load from index.html by default
  config.ele('content', { src: 'index.html' });

  // Copy all the access rules
  _.each(accessRules, function (rule, pattern) {
    var opts = { origin: pattern };
    if (rule === 'external')
      opts['launch-external'] = true;

    config.ele('access', opts);
  });

  var iosPlatform = config.ele('platform', { name: 'ios' });
  var androidPlatform = config.ele('platform', { name: 'android' });

  // Prepare the resources folder
  var resourcesPath = files.pathJoin(cordovaProject.projectRoot, 'resources');
  files.rm_recursive(resourcesPath);
  files.mkdir_p(resourcesPath);

  Console.debug('Copying resources for mobile apps');

  var imageXmlRec = function (name, width, height, src) {
    var androidMatch = /android_(.?.dpi)_(landscape|portrait)/g.exec(name);
    var xmlRec = {
      src: src,
      width: width,
      height: height
    };

    // XXX special case for Android
    if (androidMatch)
      xmlRec.density = androidMatch[2].substr(0, 4) + '-' + androidMatch[1];

    return xmlRec;
  };
  var setImages = function (sizes, xmlEle, tag) {
    _.each(sizes, function (size, name) {
      var width = size.split('x')[0];
      var height = size.split('x')[1];

      var suppliedPath = imagePaths[tag][name];
      if (!suppliedPath)
        return;

      var suppliedFilename = _.last(suppliedPath.split(files.pathSep));
      var extension = _.last(suppliedFilename.split('.'));

      // XXX special case for 9-patch png's
      if (suppliedFilename.match(/\.9\.png$/)) {
        extension = '9.png';
      }

      var fileName = name + '.' + tag + '.' + extension;
      var src = files.pathJoin('resources', fileName);

      // copy the file to the build folder with a standardized name
      files.copyFile(files.pathResolve(projectContext.projectDir, suppliedPath),
                     files.pathJoin(resourcesPath, fileName));

      // set it to the xml tree
      xmlEle.ele(tag, imageXmlRec(name, width, height, src));

      // XXX reuse one size for other dimensions
      var dups = {
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
      _.each(dups, function (size) {
        width = size.split('x')[0];
        height = size.split('x')[1];
        // XXX this is fine to not supply a name since it is always iOS, but
        // this is a hack right now.
        xmlEle.ele(tag, imageXmlRec('n/a', width, height, src));
      });
    });
  };

  // add icons and launch screens to config and copy the files on fs
  setImages(iconIosSizes, iosPlatform, 'icon');
  setImages(iconAndroidSizes, androidPlatform, 'icon');
  setImages(launchIosSizes, iosPlatform, 'splash');
  setImages(launchAndroidSizes, androidPlatform, 'splash');

  var formattedXmlConfig = config.end({ pretty: true });
  var configPath = files.pathJoin(cordovaProject.projectRoot, 'config.xml');

  Console.debug('Writing new config.xml');
  files.writeFile(configPath, formattedXmlConfig, 'utf8');
};
