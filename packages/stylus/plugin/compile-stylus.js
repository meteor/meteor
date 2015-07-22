const url = Npm.require('url');
const stylus = Npm.require('stylus');
const nib = Npm.require('nib');
const Future = Npm.require('fibers/future');
const fs = Npm.require('fs');
const path = Npm.require('path');

Plugin.registerCompiler({
  extensions: ['styl'],
  archMatching: 'web'
}, () => new StylusCompiler());

const APP_SYMBOL = '__app__';

// CompileResult is {css, sourceMap}.
class StylusCompiler extends MultiFileCachingCompiler {
  constructor() {
    super({
      compilerName: 'stylus',
      defaultCacheSize: 1024*1024*10,
      // because of currentlyCompiledFile etc
      maxParallelism: 1
    });
  }


  getCacheKey(inputFile) {
    return inputFile.getSourceHash();
  }

  compileResultSize(compileResult) {
    return compileResult.css.length +
      this.sourceMapSize(compileResult.sourceMap);
  }

  // Same as in less, except with {__app__} instead of {};
  getAbsoluteImportPath(inputFile) {
    const packageName = inputFile.getPackageName() || APP_SYMBOL;
    return '{' + packageName + '}/' + inputFile.getPathInPackage();
  }

  // The heuristic is that a file is an import (ie, is not itself processed as a
  // root) if it is in a subdirectory named 'imports' or if it matches
  // *.import.styl. This can be overridden in either direction via an explicit
  // `isImport` file option in api.addFiles.
  isRoot(inputFile) {
    const fileOptions = inputFile.getFileOptions();
    if (fileOptions.hasOwnProperty('isImport')) {
      return !fileOptions.isImport;
    }

    const pathInPackage = inputFile.getPathInPackage();
    return !(/\.import\.styl$/.test(pathInPackage) ||
             /(?:^|\/)imports\//.test(pathInPackage));
  }

  compileOneFile(inputFile, allFiles) {
    const referencedImportPaths = [];

    function parseImportPath(filePath, importerPath) {
      if (! filePath) {
        throw new Error('filePath is undefined');
      }
      if (filePath === inputFile.getPathInPackage()) {
        return {
          packageName: inputFile.getPackageName() || APP_SYMBOL,
          pathInPackage: '/' + inputFile.getPathInPackage()
        };
      }
      if (! filePath.match(/^\{.*\}\//)) {
        if (! importerPath) {
          return { packageName: inputFile.getPackageName() || APP_SYMBOL,
                   pathInPackage: '/' + filePath };
        }

        // relative path in the same package
        const parsedImporter = parseImportPath(importerPath, null);
        return {
          packageName: parsedImporter.packageName,
          pathInPackage: url.resolve(parsedImporter.pathInPackage, filePath)
        };
      }

      const match = /^(\{.*\})(\/.*)$/.exec(filePath);
      if (! match) { return null; }

      let packageName = match[1];
      if (!packageName || packageName === '{}') {
        packageName = APP_SYMBOL;
      } else {
        packageName = packageName.substr(1, packageName.length - 2);
      }

      const pathInPackage = match[2];
      return {packageName, pathInPackage};
    }
    function absoluteImportPath(parsed) {
      return '{' + parsed.packageName + '}' + parsed.pathInPackage;
    }

    const importer = {
      find(importPath, paths, importerPath) {
        const parsed = parseImportPath(importPath, importerPath);

        if (! parsed) { return null; }

        if (importPath[0] !== '{') {
          // if it is not a custom syntax path, it could be a lookup in a folder
          for (let i = paths.length - 1; i >= 0; i--) {
            const joined = path.join(paths[i], importPath)
              .replace(/\\/g, '/'); // XXX turn Windows paths back into standard path
            if (fs.existsSync(joined))
              return [joined];
          }
        }

        const absolutePath = absoluteImportPath(parsed);

        if (! allFiles.has(absolutePath)) {
          return null;
        }

        return [absolutePath];
      },
      readFile(filePath) {
        const isAbsolute = (process.platform === 'win32') ?
                filePath[0].match(/^[A-Za-z]:\\/) : filePath[0] === '/';
        const normalizedPath = (process.platform === 'win32') ?
                filePath.replace(/\\/g, '/') : filePath;
        const isNib =
                normalizedPath.indexOf('/node_modules/nib/lib/nib/') !== -1;
        const isStylusBuiltIn =
                normalizedPath.indexOf('/node_modules/stylus/lib/') !== -1;

        if (isAbsolute || isNib || isStylusBuiltIn) {
          // absolute path? let the default implementation handle this
          return fs.readFileSync(filePath, 'utf8');
        }

        const parsed = parseImportPath(filePath);
        const absolutePath = absoluteImportPath(parsed);

        referencedImportPaths.push(absolutePath);

        if (! allFiles.has(absolutePath)) {
          throw new Error(
            `Cannot read file ${absolutePath} for ${inputFile.getDisplayPath()}`
          );
        }

        return allFiles.get(absolutePath).getContentsAsString();
      }
    };

    function processSourcemap(sourcemap) {
      delete sourcemap.file;
      sourcemap.sourcesContent = sourcemap.sources.map(importer.readFile);
      sourcemap.sources = sourcemap.sources.map((filePath) => {
        const parsed = parseImportPath(filePath);
        if (parsed.packageName === APP_SYMBOL)
          return parsed.pathInPackage.substr(1);
        return 'packages/' + parsed.packageName + parsed.pathInPackage;
      });

      return sourcemap;
    }

    const f = new Future;

    const style = stylus(inputFile.getContentsAsString())
            .use(nib())
            .set('filename', inputFile.getPathInPackage())
            .set('sourcemap', { inline: false, comment: false })
            .set('cache', false)
            .set('importer', importer);

    style.render(f.resolver());
    let css;
    try {
      css = f.wait();
    } catch (e) {
      inputFile.error({
        message: 'Stylus compiler error: ' + e.message
      });
      return null;
    }
    const sourceMap = processSourcemap(style.sourcemap);
    return {referencedImportPaths, compileResult: {css, sourceMap}};
  }

  addCompileResult(inputFile, {css, sourceMap}) {
    inputFile.addStylesheet({
      path: inputFile.getPathInPackage() + '.css',
      data: css,
      sourceMap: sourceMap
    });
  }
}
