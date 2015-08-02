const { cordova, events, CordovaError } = Npm.require('cordova-lib');
const superspawn = Npm.require('cordova-lib/src/cordova/superspawn.js');
const cordova_util = Npm.require('cordova-lib/src/cordova/util.js');
const PluginInfoProvider = Npm.require('cordova-lib/src/PluginInfoProvider.js');

Cordova = { cordova, events, CordovaError, superspawn, cordova_util, PluginInfoProvider };
