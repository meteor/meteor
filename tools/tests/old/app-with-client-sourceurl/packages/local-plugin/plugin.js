Plugin.registerCompiler(
  {
    extensions: ["printme"],
    archMatching: "web",
  },
  function () {
    return new PrintmeCompiler();
  },
);

function PrintmeCompiler() {}

PrintmeCompiler.prototype.processFilesForTarget = function (inputFiles) {
  inputFiles.forEach(function (inputFile) {
    const source = inputFile.getContentsAsString();
    const sourcePath = inputFile.getPathInPackage();
    const isDynamic = sourcePath === "foo.printme";
    let data = `console.log(${JSON.stringify(`PMC: ${source}`)});\n`;

    if (isDynamic) {
      data += "//# sourceMappingURL=printme-compiler.js.map\n";
    } else {
      data += "module.dynamicImport('./foo.printme.js');\n//# sourceURL=printme-compiler.js\n";
    }

    const options = {
      path: `${sourcePath}.js`,
      sourcePath: sourcePath,
      data: data,
      lazy: isDynamic,
    };

    if (isDynamic) {
      options.sourceMap = {
        version: 3,
        sources: [sourcePath],
        names: [],
        mappings: "AAAA",
        sourcesContent: [source],
      };
    }

    inputFile.addJavaScript(options);
  });
};
