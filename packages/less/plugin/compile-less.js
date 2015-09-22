const path = Plugin.path;
const less = Npm.require('less');
const Future = Npm.require('fibers/future');

Plugin.registerCompiler({
  // *.lessimport has been deprecated since 0.7.1, but it still works. We
  // *recommend *.import.less or the imports subdirectory instead.
  extensions: ['less', 'lessimport'],
  archMatching: 'web'
}, () => new LessCompiler());

// CompileResult is {css, sourceMap}.
class LessCompiler extends MultiFileCachingCompiler {
  constructor() {
    super({
      compilerName: 'less',
      defaultCacheSize: 1024*1024*10,
    });
  }

  getCacheKey(inputFile) {
    return inputFile.getSourceHash();
  }

  compileResultSize(compileResult) {
    return compileResult.css.length +
      this.sourceMapSize(compileResult.sourceMap);
  }

  // The heuristic is that a file is an import (ie, is not itself processed as a
  // root) if it is in a subdirectory named 'imports' or if it matches
  // *.import.less. This can be overridden in either direction via an explicit
  // `isImport` file option in api.addFiles.
  isRoot(inputFile) {
    const fileOptions = inputFile.getFileOptions();
    if (fileOptions.hasOwnProperty('isImport')) {
      return !fileOptions.isImport;
    }

    const pathInPackage = inputFile.getPathInPackage();
    return !(/\.import\.less$/.test(pathInPackage) ||
             /\.lessimport$/.test(pathInPackage) ||
             /(?:^|\/)imports\//.test(pathInPackage));
  }

  compileOneFile(inputFile, allFiles) {
    const importPlugin = new MeteorImportLessPlugin(allFiles);

    const f = new Future;
    let output;
    try {
      less.render(inputFile.getContentsAsBuffer().toString('utf8'), {
        filename: this.getAbsoluteImportPath(inputFile),
        plugins: [importPlugin],
        // Generate a source map, and include the source files in the
        // sourcesContent field.  (Note that source files which don't themselves
        // produce text (eg, are entirely variable definitions) won't end up in
        // the source map!)
        sourceMap: { outputSourceFiles: true }
      }, f.resolver());
      output = f.wait();
    } catch (e) {
      inputFile.error({
        message: e.message,
        sourcePath: decodeFilePath(e.filename),
        line: e.line,
        column: e.column
      });
      return null;
    }

    if (output.map) {
      const map = JSON.parse(output.map);
      map.sources = map.sources.map(decodeFilePath);
      output.map = map;
    }

    const compileResult = {css: output.css, sourceMap: output.map};
    const referencedImportPaths = [];
    output.imports.forEach((path) => {
      // Some files that show up in output.imports are not actually files; for
      // example @import url("...");
      if (allFiles.has(path)) {
        referencedImportPaths.push(path);
      }
    });

    return {compileResult, referencedImportPaths};
  }

  addCompileResult(inputFile, compileResult) {
    inputFile.addStylesheet({
      data: compileResult.css,
      path: inputFile.getPathInPackage() + '.css',
      sourceMap: compileResult.sourceMap
    });
  }
}

class MeteorImportLessPlugin {
  constructor(allFiles) {
    this.allFiles = allFiles;
    this.minVersion = [2, 5, 0];
  }

  install(less, pluginManager) {
    pluginManager.addFileManager(
      new MeteorImportLessFileManager(this.allFiles));
  }
}

class MeteorImportLessFileManager extends less.AbstractFileManager {
  constructor(allFiles) {
    super();
    this.allFiles = allFiles;
  }

  // We want to be the only active FileManager, so claim to support everything.
  supports(filename) {
    // We shouldn't process files that start with `//` or a protocol because
    // those are not relative to the app at all; they are probably native
    // CSS imports
    if (! filename.match(/^(https?:)?\/\//)) {
      return true;
    }

    return false;
  }

  loadFile(filename, currentDirectory, options, environment, cb) {
    const packageMatch = currentDirectory.match(/^(\{[^}]*\})/);
    if (! packageMatch) {
      // shouldn't happen.  all filenames less ever sees should involve this {}
      // thing!
      cb(new Error('file without Meteor context? ' + currentDirectory));
      return;
    }
    const currentPackagePrefix = packageMatch[1];

    let resolvedFilename;
    if (filename[0] === '/') {
      // Map `/foo/bar.less` onto `{thispackage}/foo/bar.less`
      resolvedFilename = currentPackagePrefix + filename;
    } else if (filename[0] === '{') {
      resolvedFilename = filename;
    } else {
      resolvedFilename = path.join(currentDirectory, filename);
    }

    if (!this.allFiles.has(resolvedFilename)) {
      cb({type: 'File', message: 'Unknown import: ' + filename});
      return;
    }
    cb(null, {
      contents: this.allFiles.get(resolvedFilename)
        .getContentsAsBuffer().toString('utf8'),
      filename: resolvedFilename
    });
  }
}

function decodeFilePath (filePath) {
  const match = filePath.match(/^{(.*)}\/(.*)$/);
  if (! match)
    throw new Error('Failed to decode Less path: ' + filePath);

  if (match[1] === '') {
    // app
    return match[2];
  }

  return 'packages/' + match[1] + '/' + match[2];
}
