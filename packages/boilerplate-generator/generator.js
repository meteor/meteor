import { readFile } from 'fs';
import { create as createStream } from "combined-stream2";

import WebBrowserTemplate from './template-web.browser';
import WebCordovaTemplate from './template-web.cordova';

// Copied from webapp_server
const readUtf8FileSync = filename => Meteor.wrapAsync(readFile)(filename, 'utf8');

const identity = value => value;

function appendToStream(chunk, stream) {
  if (typeof chunk === "string") {
    stream.append(Buffer.from(chunk, "utf8"));
  } else if (Buffer.isBuffer(chunk) ||
             typeof chunk.read === "function") {
    stream.append(chunk);
  }
}

export class Boilerplate {
  constructor(arch, manifest, options = {}) {
    const { headTemplate, closeTemplate } = _getTemplate(arch);
    this.headTemplate = headTemplate;
    this.closeTemplate = closeTemplate;
    this.baseData = null;

    this._generateBoilerplateFromManifest(
      manifest,
      options
    );
  }

  // The 'extraData' argument can be used to extend 'self.baseData'. Its
  // purpose is to allow you to specify data that you might not know at
  // the time that you construct the Boilerplate object. (e.g. it is used
  // by 'webapp' to specify data that is only known at request-time).
  // this returns a stream
  toHTML(extraData) {
    if (!this.baseData || !this.headTemplate || !this.closeTemplate) {
      throw new Error('Boilerplate did not instantiate correctly.');
    }

    const data = {...this.baseData, ...extraData};
    const start = "<!DOCTYPE html>\n" + this.headTemplate(data);

    const { body, dynamicBody } = data;

    const end = this.closeTemplate(data);
    const response = createStream();

    appendToStream(start, response);

    if (body) {
      appendToStream(body, response);
    }

    if (dynamicBody) {
      appendToStream(dynamicBody, response);
    }

    appendToStream(end, response);

    return response;
  }

  // XXX Exported to allow client-side only changes to rebuild the boilerplate
  // without requiring a full server restart.
  // Produces an HTML string with given manifest and boilerplateSource.
  // Optionally takes urlMapper in case urls from manifest need to be prefixed
  // or rewritten.
  // Optionally takes pathMapper for resolving relative file system paths.
  // Optionally allows to override fields of the data context.
  _generateBoilerplateFromManifest(manifest, {
    urlMapper = identity,
    pathMapper = identity,
    baseDataExtension,
    inline,
  } = {}) {

    const boilerplateBaseData = {
      css: [],
      js: [],
      head: '',
      body: '',
      meteorManifest: JSON.stringify(manifest),
      ...baseDataExtension,
    };

    manifest.forEach(item => {
      const urlPath = urlMapper(item.url);
      const itemObj = { url: urlPath };

      if (inline) {
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
        !item.path.startsWith('dynamic/')) {
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

    this.baseData = boilerplateBaseData;
  }
};

// Returns a template function that, when called, produces the boilerplate
// html as a string.
const _getTemplate = arch => {
  if (arch === 'web.browser') {
    return WebBrowserTemplate;
  } else if (arch === 'web.cordova') {
    return WebCordovaTemplate;
  } else {
    throw new Error('Unsupported arch: ' + arch);
  }
};
