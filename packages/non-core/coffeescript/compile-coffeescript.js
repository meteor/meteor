Plugin.registerCompiler({
  extensions: ['coffee', 'litcoffee', 'coffee.md']
}, () => new CachedCoffeeScriptCompiler());


// The CompileResult for this CachingCompiler is a {source, sourceMap} object.
class CachedCoffeeScriptCompiler extends CachingCompiler {
  constructor() {
    super({
      compilerName: 'coffeescript',
      defaultCacheSize: 1024*1024*10,
    });

    this.coffeeScriptCompiler = new CoffeeScriptCompiler();
  }

  getCacheKey(inputFile) {
    return [
      inputFile.getSourceHash(),
      inputFile.getDeclaredExports(),
      this.coffeeScriptCompiler.getCompileOptions(inputFile),
    ];
  }

  setDiskCacheDirectory(cacheDir) {
    this.coffeeScriptCompiler.babelCompiler.setDiskCacheDirectory(cacheDir);
    return super.setDiskCacheDirectory(cacheDir);
  }

  compileOneFile(inputFile) {
    return this.coffeeScriptCompiler.compileOneFile(inputFile);
  }

  addCompileResult(inputFile, sourceWithMap) {
    inputFile.addJavaScript({
      path: this.coffeeScriptCompiler.outputFilePath(inputFile),
      sourcePath: inputFile.getPathInPackage(),
      data: sourceWithMap.source,
      sourceMap: sourceWithMap.sourceMap,
      bare: inputFile.getFileOptions().bare
    });
  }

  compileResultSize(sourceWithMap) {
    return sourceWithMap.source.length +
      this.sourceMapSize(sourceWithMap.sourceMap);
  }
}
