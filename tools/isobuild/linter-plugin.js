import { InputFile } from "./build-plugin.js";

export class LinterPlugin {
  constructor(pluginDefinition, userPlugin) {
    this.pluginDefinition = pluginDefinition;
    this.userPlugin = userPlugin;
  }
}

export class LintingFile extends InputFile {
  constructor(source) {
    super();
    this._source = source;
  }

  getContentsAsBuffer() {
    return this._source.contents;
  }

  getPathInPackage() {
    return this._source.relPath;
  }

  getPackageName() {
    return this._source["package"];
  }

  getSourceHash() {
    return this._source.hash;
  }

  getArch() {
    return this._source.arch;
  }

  getFileOptions() {
    return this._source.fileOptions || {};
  }
}
