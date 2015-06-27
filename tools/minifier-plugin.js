import buildPluginModule from './build-plugin.js';

class InputFile extends buildPluginModule.InputFile {
  constructor(source, options = {}) {
    super();

    this._source = source;
    this._arch = options.arch;
    this._minifiedFiles = [];
  }

  getContentsAsBuffer() {
    return this._source.contents();
  }
  getPathInPackage() {
    throw new Error("Compiled files don't belong to any package");
  }
  getPackageName() {
    throw new Error("Compiled files don't belong to any package");
  }
  getSourceHash() {
    return this._source.hash();
  }
  getArch() {
    return this._arch;
  }

  /**
   * @summary Returns the path of the compiled file in the bundle.
   * @memberof InputFile
   * @returns {String}
   */
  getPathInBundle() {
    return this._source.targetPath;
  }

  /**
   * @summary Returns the source-map associated with the file.
   * @memberof InputFile
   * @returns {String}
   */
  getSourceMap() {
    return this._source.sourceMap;
  }
}

export class JsFile extends InputFile {
  // - data
  // - sourceMap
  // - path
  // - hash?
  addJavaScript(options) {
    const self = this;
    self._minifiedFiles.push({
      data: options.data,
      sourceMap: options.sourceMap,
      path: options.path
    });
  }
}

export class CssFile extends InputFile {
  // - data
  // - sourceMap
  // - path
  // - hash?
  addStylesheet(options) {
    this._minifiedFiles.push({
      data: options.data,
      sourceMap: options.sourceMap,
      path: options.path
    });
  }
}

