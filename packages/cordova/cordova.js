const { cordova, events, CordovaError } = Npm.require('cordova-lib');
const superspawn = Npm.require('cordova-lib/src/cordova/superspawn.js');
const cordova_util = Npm.require('cordova-lib/src/cordova/util.js');

Cordova = { cordova, events, CordovaError, superspawn, cordova_util };
