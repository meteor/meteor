var path = Npm.require('path');

function TemplateCompiler () {}
TemplateCompiler.prototype.processFilesForTarget = function (files) {
  var bodyAttrs = {};
  var bodyAttrsOrigin = {};

  files.forEach(function (file) {
    var scanned = doHTMLScanning(file, html_scanner);
    Object.keys(scanned.bodyAttrs).forEach(function (attr) {
      var val = scanned.bodyAttrs[attr];
      if (bodyAttrs.hasOwnProperty(attr) && bodyAttrs[attr] !== val) {
        // two conflicting attributes on <body> tags in two different template
        // files
        var conflictingFilesStr = [bodyAttrsOrigin[attr], file].map(function (f) {
          return f.getPathInPackage();
        }).join(', ');

        file.error({
          message: [
            "<body> declarations have conflicting values for the '",
            attr,
            "' attribute in the following files: ",
            conflictingFilesStr,
            "."
          ].join('')
        });
        return;
      }

      bodyAttrs[attr] = val;
      bodyAttrsOrigin[attr] = file;
    });
  });
};

var doHTMLScanning = function (inputFile, htmlScanner) {
  var contents = inputFile.getContentsAsString();
  try {
    var results = htmlScanner.scan(contents, inputFile.getPathInPackage());
  } catch (e) {
    if ((e instanceof htmlScanner.ParseError) || (e instanceof htmlScanner.BodyAttrsError)) {
      inputFile.error({
        message: e.message,
        line: e.line
      });
      return null;
    } else {
      throw e;
    }
  }

  if (results.head)
    inputFile.addHtml({ section: "head", data: results.head });

  if (results.body)
    inputFile.addHtml({ section: "body", data: results.body });

  if (results.js) {
    var filePath = inputFile.getPathInPackage();
    var pathPart = path.dirname(filePath);
    if (pathPart === '.')
      pathPart = '';
    if (pathPart.length && pathPart !== path.sep)
      pathPart = pathPart + path.sep;
    var ext = path.extname(filePath);
    var basename = path.basename(filePath, ext);

    // XXX generate a source map

    inputFile.addJavaScript({
      path: path.join(pathPart, "template." + basename + ".js"),
      data: results.js
    });
  }

  return {
    bodyAttrs: results.bodyAttrs
  };
};

Plugin.registerCompiler({
  extensions: ['html'],
  archMatching: 'web',
  isTemplate: true
}, function () {
    return new TemplateCompiler();
});

