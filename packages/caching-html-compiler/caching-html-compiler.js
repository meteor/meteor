const path = Plugin.path;

// The CompileResult type for this CachingCompiler is the return value of
// htmlScanner.scan: a {js, head, body, bodyAttrs} object.
CachingHtmlCompiler = class CachingHtmlCompiler extends CachingCompiler {
  /**
   * Constructor for CachingHtmlCompiler
   * @param  {String} name The name of the compiler, printed in errors -
   * should probably always be the same as the name of the build
   * plugin/package
   * @param  {Function} tagScannerFunc Transforms a template file (commonly
   * .html) into an array of Tags
   * @param  {Function} tagHandlerFunc Transforms an array of tags into a
   * results object with js, body, head, and bodyAttrs properties
   */
  constructor(name, tagScannerFunc, tagHandlerFunc) {
    super({
      compilerName: name,
      defaultCacheSize: 1024*1024*10,
    });

    this._bodyAttrInfo = null;

    this.tagScannerFunc = tagScannerFunc;
    this.tagHandlerFunc = tagHandlerFunc;
  }

  // Implements method from CachingCompilerBase
  compileResultSize(compileResult) {
    function lengthOrZero(field) {
      return field ? field.length : 0;
    }
    return lengthOrZero(compileResult.head) + lengthOrZero(compileResult.body) +
      lengthOrZero(compileResult.js);
  }

  // Overrides method from CachingCompiler
  processFilesForTarget(inputFiles) {
    this._bodyAttrInfo = {};
    super.processFilesForTarget(inputFiles);
  }

  // Implements method from CachingCompilerBase
  getCacheKey(inputFile) {
    // Note: the path is only used for errors, so it doesn't have to be part
    // of the cache key.
    return inputFile.getSourceHash();
  }

  // Implements method from CachingCompiler
  compileOneFile(inputFile) {
    const contents = inputFile.getContentsAsString();
    const inputPath = inputFile.getPathInPackage();
    try {
      const tags = this.tagScannerFunc({
        sourceName: inputPath,
        contents: contents,
        tagNames: ["body", "head", "template"]
      });

      return this.tagHandlerFunc(tags);
    } catch (e) {
      if (e instanceof TemplatingTools.CompileError) {
        inputFile.error({
          message: e.message,
          line: e.line
        });
        return null;
      } else {
        throw e;
      }
    }
  }

  // Implements method from CachingCompilerBase
  addCompileResult(inputFile, compileResult) {
    let allJavaScript = "";

    if (compileResult.head) {
      inputFile.addHtml({ section: "head", data: compileResult.head });
    }

    if (compileResult.body) {
      inputFile.addHtml({ section: "body", data: compileResult.body });
    }

    if (compileResult.js) {
      allJavaScript += compileResult.js;
    }

    if (! _.isEmpty(compileResult.bodyAttrs)) {
      Object.keys(compileResult.bodyAttrs).forEach((attr) => {
        const value = compileResult.bodyAttrs[attr];
        if (this._bodyAttrInfo.hasOwnProperty(attr) &&
            this._bodyAttrInfo[attr].value !== value) {
          // two conflicting attributes on <body> tags in two different template
          // files
          inputFile.error({
            message:
            `<body> declarations have conflicting values for the '${ attr }' ` +
              `attribute in the following files: ` +
              this._bodyAttrInfo[attr].inputFile.getPathInPackage() +
              `, ${ inputFile.getPathInPackage() }`
          });
        } else {
          this._bodyAttrInfo[attr] = {inputFile, value};
        }
      });

      const setAttributesOnBody = _.map(compileResult.bodyAttrs, (val, key) => {
        return `document.body.setAttribute('${key}', '${val}');`
      }).join("\n  ");

      // Add JavaScript code to set attributes on body. Don't use JQuery here
      // because not all users of this package will have it
      allJavaScript += `
Meteor.startup(function() {
  ${setAttributesOnBody}
});
`;
    }


    if (allJavaScript) {
      const filePath = inputFile.getPathInPackage();
      // XXX this path manipulation may be unnecessarily complex
      let pathPart = path.dirname(filePath);
      if (pathPart === '.')
        pathPart = '';
      if (pathPart.length && pathPart !== path.sep)
        pathPart = pathPart + path.sep;
      const ext = path.extname(filePath);
      const basename = path.basename(filePath, ext);

      // XXX generate a source map

      inputFile.addJavaScript({
        path: path.join(pathPart, basename + ".compiled.html.js"),
        data: allJavaScript
      });
    }
  }
}
