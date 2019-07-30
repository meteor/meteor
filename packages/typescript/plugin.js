Plugin.registerCompiler({
  extensions: ["ts", "tsx"],
}, function () {
  return new TypeScriptCompiler({
    react: true,
    typescript: true,
  });
});

class TypeScriptCompiler extends BabelCompiler {
  processFilesForTarget(inputFiles) {
    return super.processFilesForTarget(inputFiles.filter(
      // TypeScript .d.ts declaration files look like .ts files, but it's
      // important that we do not compile them using the TypeScript
      // compiler, as it will fail with a cryptic error message.
      file => ! file.getPathInPackage().endsWith(".d.ts")
    ));
  }
}
