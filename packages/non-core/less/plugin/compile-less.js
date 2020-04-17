const path = Plugin.path;
const less = Npm.require('less');

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
    return [
      inputFile.getArch(),
      inputFile.getSourceHash(),
    ];
  }

  compileResultSize(compileResult) {
    return compileResult.css.length +
      this.sourceMapSize(compileResult.sourceMap);
  }

  // The heuristic is that a file is an import (ie, is not itself
  // processed as a root) if it matches *.import.less or *.lessimport.
  // This can be overridden in either direction via an explicit `isImport`
  // file option in api.addFiles.
  isRoot(inputFile) {
    const fileOptions = inputFile.getFileOptions();
    if (fileOptions.hasOwnProperty('isImport')) {
      return !fileOptions.isImport;
    }

    const pathInPackage = inputFile.getPathInPackage();
    return !(/\.import\.less$/.test(pathInPackage) ||
             /\.lessimport$/.test(pathInPackage));
  }

  compileOneFileLater(inputFile, getResult) {
    inputFile.addStylesheet({
      path: inputFile.getPathInPackage(),
    }, async () => {
      const result = await getResult();
      return result && {
        data: result.css,
        sourceMap: result.sourceMap,
      };
    });
  }

  compileOneFile(inputFile, allFiles) {
    const importPlugin = new MeteorImportLessPlugin(allFiles);

    return less.render(inputFile.getContentsAsBuffer().toString('utf8'), {
      filename: this.getAbsoluteImportPath(inputFile),
      plugins: [importPlugin],
      // Enabled as it was default true before less v3.0.0
      javascriptEnabled: true,
      // Generate a source map, and include the source files in the
      // sourcesContent field. (Note that source files which don't
      // themselves produce text (eg, are entirely variable definitions)
      // won't end up in the source map!)
      sourceMap: { outputSourceFiles: true }

    }).then(output => {
      if (output.map) {
        const map = JSON.parse(output.map);
        map.sources = map.sources.map(decodeFilePath);
        output.map = map;
      }

      const compileResult = {
        css: output.css,
        sourceMap: output.map,
      };

      const referencedImportPaths = [];
      output.imports.forEach((outputPath) => {
        // Some files that show up in output.imports are not actually files; for
        // example @import url("...");
        if (allFiles.has(outputPath)) {
          referencedImportPaths.push(outputPath);
        }
      });

      return {
        compileResult,
        referencedImportPaths,
      };

    }, e => {
      inputFile.error({
        message: e.message,
        sourcePath: decodeFilePath(e.filename),
        line: e.line,
        column: e.column
      });

      return null;
    });
  }

  addCompileResult(inputFile, compileResult) {
    inputFile.addStylesheet({
      data: compileResult.css,
      path: `${inputFile.getPathInPackage()}.css`,
      sourceMap: compileResult.sourceMap
    });
  }
}

function MeteorImportLessPlugin(allFiles) {
  this.minVersion = [3, 6, 0];

  this.install = (l, pluginManager) => {
    pluginManager.addFileManager(new MeteorImportLessFileManager(allFiles));
  };
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
    return !filename.match(/^(https?:)?\/\//);
  }

  loadFile(filename, currentDirectory) {
    const packageMatch = currentDirectory.match(/^(\{[^}]*\})/);
    if (!packageMatch) {
      // shouldn't happen.  all filenames less ever sees should involve this {}
      // thing!
      return Promise.reject(
        new Error(`file without Meteor context? ${currentDirectory}`)
      );
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
    // Import rule from less:
    // If it does not have an extension, .less will be appended and it will be included as a imported Less file.
    if (
      !this.allFiles.has(resolvedFilename) &&
      this.allFiles.has(`${resolvedFilename}.less`)
    ) {
      resolvedFilename = `${resolvedFilename}.less`;
    }

    if (!this.allFiles.has(resolvedFilename)) {
      return Promise.reject(new Error(`Unknown import: ${filename}`));
    }

    return Promise.resolve({
      contents: this.allFiles.get(resolvedFilename)
        .getContentsAsBuffer().toString('utf8'),
      filename: resolvedFilename,
    });
  }
}

function decodeFilePath(filePath) {
  const match = filePath.match(/^{(.*)}\/(.*)$/);

  if (!match) {
    // Sometimes a filePath may be an URL, such as when loading fonts from
    // https://fonts.googleapis.com/css. Preserve those URLs instead of
    // trying to rewrite them.
    return filePath;
  }

  if (match[1] === '') {
    // Importing from the application, not from a Meteor package.
    return match[2];
  }

  return `packages/${match[1]}/${match[2]}`;
}
