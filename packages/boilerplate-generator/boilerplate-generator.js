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
  self.func = null;

  self._generateBoilerplateFromManifestAndSource(
    manifest,
    self.template,
    options
  );
};

// The 'extraData' argument can be used to extend 'self.baseData'. Its
// purpose is to allow you to specify data that you might not know at
// the time that you construct the Boilerplate object. (e.g. it is used
// by 'webapp' to specify data that is only known at request-time).
Boilerplate.prototype.toHTML = function (extraData) {
  var self = this;

  if (! self.baseData || ! self.func)
    throw new Error('Boilerplate did not instantiate correctly.');

  return  "<!DOCTYPE html>\n" +
    Blaze.toHTML(Blaze.With(_.extend(self.baseData, extraData),
                            self.func));
};

// XXX Exported to allow client-side only changes to rebuild the boilerplate
// without requiring a full server restart.
// Produces an HTML string with given manifest and boilerplateSource.
// Optionally takes urlMapper in case urls from manifest need to be prefixed
// or rewritten.
// Optionally takes pathMapper for resolving relative file system paths.
// Optionally allows to override fields of the data context.
Boilerplate.prototype._generateBoilerplateFromManifestAndSource =
  function (manifest, boilerplateSource, options) {
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
      if (item.type === 'js' && item.where === 'client') {
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
    var boilerplateRenderCode = SpacebarsCompiler.compile(
      boilerplateSource, { isBody: true });

    // Note that we are actually depending on eval's local environment capture
    // so that UI and HTML are visible to the eval'd code.
    // XXX the template we are evaluating relies on the fact that UI is globally
      // available.
    global.UI = UI;
    self.func = eval(boilerplateRenderCode);
    self.baseData = boilerplateBaseData;
};

var _getTemplate = _.memoize(function (arch) {
  var filename = 'boilerplate_' + arch + '.html';
  return Assets.getText(filename);
});
