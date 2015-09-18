/**
 * @summary Boolean variable.  True if running in a Cordova mobile environment.
 * @type {Boolean}
 * @static
 * @locus Anywhere
 */
Meteor.isCordova = true;

Meteor.Cordova = Meteor.Cordova || {};

Meteor.Cordova._additionalDataPath = null;
Meteor.Cordova._additionalDataUrlPrefix = 'data';

Meteor.Cordova._trimFileProtocol = function(path) {
    var fileProtocol = 'file://';

    if (path.substr(0, fileProtocol.length) === fileProtocol)
        path = path.substr(fileProtocol.length);

    return path;
};

/**
 * @memberOf Meteor
 * @summary Sets an additional path on the mobile device that will be available in the Cordova environment using the url http://meteor.local/data
 * @locus Client
 * @param {String} [path] An absolute, valid path to a directory on the mobile device
 */
Meteor.Cordova.setAdditionalDataPath = function(path) {

    var cordovaUpdate = cordova && cordova.plugins && cordova.plugins.CordovaUpdate;
    if (! cordovaUpdate) {
        throw new Error('No CordovaUpdate plugin found. Is this running in Cordova?');
    }

    if (! path || path.length === 0) {
        throw new Error('Path not specified.');
    }

    path = Meteor.Cordova._trimFileProtocol(path);

    if (path.substr(0,1) !== '/') {
        throw new Error('Relative paths are not supported.');
    }

    cordovaUpdate.setAdditionalDataPath(
        path,
        function() { Meteor.Cordova._additionalDataPath = path; },
        function(error) { throw new Error(error); }
    );
};

/**
 * @memberOf Meteor
 * @summary Sets the url prefix that the additional data path is available on so that the url looks like http://meteor.local/<prefix>. The default prefix is `data`.
 * @locus Client
 * @param {String} [prefix] Must be alphaumeric and different from `plugins`
 */
Meteor.Cordova.setAdditionalDataUrlPrefix = function(prefix) {

    var cordovaUpdate = cordova && cordova.plugins && cordova.plugins.CordovaUpdate;
    if (! cordovaUpdate) {
        throw new Error('No CordovaUpdate plugin found. Is this running in Cordova?');
    }

    if (! prefix || prefix.length === 0) {
        throw new Error('Prefix not specified.');
    }

    cordovaUpdate.setAdditionalDataUrlPrefix(
        prefix,
        function() { Meteor.Cordova._additionalDataUrlPrefix = prefix; },
        function(error) { throw new Error(error); }
    );
};

/**
 * @memberOf Meteor
 * @summary Super simple method that returns the proper url for accessing a file that is in the directory that was previously set as an additional data path.
 * @locus Client
 * @param {String} [path] An absolute, valid path to a file on the mobile device
 */
Meteor.Cordova.getUrlForPath = function(path) {
    if (! path) {
        throw new Error('Path not provided.');
    }

    if (! Meteor.Cordova._additionalDataPath) {
        throw new Error('Additional data path not set. Use Meteor.setAdditionalDataPath first.');
    }

    path = Meteor.Cordova._trimFileProtocol(path);

    if (path.substr(0, Meteor.Cordova._additionalDataPath.length) !== Meteor.Cordova._additionalDataPath) {
        throw new Error('Path must be an absolute path and start with the path previously set with Meteor.setAdditionalDataPath.');
    }

    return "http://meteor.local/" + Meteor.Cordova._additionalDataUrlPrefix + '/' + path.substr(Meteor.Cordova._additionalDataPath.length);
};