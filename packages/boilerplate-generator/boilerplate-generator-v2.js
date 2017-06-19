var fs = Npm.require('fs');
var path = Npm.require('path');

// Copied from webapp_server
var readUtf8FileSync = function (filename) {
  return Meteor.wrapAsync(fs.readFile)(filename, 'utf8');
};

Boilerplate = function (arch, manifest, options) {
  var self = this;
  options = options || {};
  self.template = _getTemplate(arch);
  self.baseData = null;

  self._generateBoilerplateFromManifest(
    manifest,
    options
  );
};

// The 'extraData' argument can be used to extend 'self.baseData'. Its
// purpose is to allow you to specify data that you might not know at
// the time that you construct the Boilerplate object. (e.g. it is used
// by 'webapp' to specify data that is only known at request-time).
Boilerplate.prototype.toHTML = function (extraData) {
  var self = this;

  if (! self.baseData || ! self.template)
    throw new Error('Boilerplate did not instantiate correctly.');

  return  "<!DOCTYPE html>\n" + self.template(_.extend(self.baseData, extraData));
};

// XXX Exported to allow client-side only changes to rebuild the boilerplate
// without requiring a full server restart.
// Produces an HTML string with given manifest and boilerplateSource.
// Optionally takes urlMapper in case urls from manifest need to be prefixed
// or rewritten.
// Optionally takes pathMapper for resolving relative file system paths.
// Optionally allows to override fields of the data context.
Boilerplate.prototype._generateBoilerplateFromManifest =
  function (manifest, options) {
    var self = this;
    // map to the identity by default
    var urlMapper = options.urlMapper || _.identity;
    var pathMapper = options.pathMapper || _.identity;

    var boilerplateBaseData = {
      css: [],
      js: [],
      head: '',
      body: '',
      meteorManifest: JSON.stringify(manifest)
    };

    // allow the caller to extend the default base data
    _.extend(boilerplateBaseData, options.baseDataExtension);

    _.each(manifest, function (item) {
      var urlPath = urlMapper(item.url);
      var itemObj = { url: urlPath };

      if (options.inline) {
        itemObj.scriptContent = readUtf8FileSync(
          pathMapper(item.path));
        itemObj.inline = true;
      }

      if (item.type === 'css' && item.where === 'client') {
        boilerplateBaseData.css.push(itemObj);
      }
      if (item.type === 'js' && item.where === 'client' &&
          // Dynamic JS modules should not be loaded eagerly in the
          // initial HTML of the app.
          ! item.path.startsWith('dynamic/')) {
        boilerplateBaseData.js.push(itemObj);
      }
      if (item.type === 'head') {
        boilerplateBaseData.head =
          readUtf8FileSync(pathMapper(item.path));
      }
      if (item.type === 'body') {
        boilerplateBaseData.body =
          readUtf8FileSync(pathMapper(item.path));
      }
    });
    self.baseData = boilerplateBaseData;
};

var _getTemplate = _.memoize(function (arch) {
  if (arch === 'web.browser') {
    return Boilerplate_Web_Browser_Template;
  } else if (arch === 'web.cordova') {
  } else {
    throw new Error('Unsupported arch: ' + arch);
  }
});
