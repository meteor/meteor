var path = require('path');
var packages = require(path.join(__dirname, 'packages.js'));
var _ = require(path.join(__dirname, 'third', 'underscore.js'));
var fs = require('fs');

// XXX this is a hack to call the jsparse package from the bundler
// put `ParseNode`, `Parser`, and `Parsers` in the global namespace
require(path.join(__dirname, '..', '..', 'packages',
                  'jsparse', 'parserlib'));
// put `JSLexer` in the global namespace
require(path.join(__dirname, '..', '..', 'packages',
                  'jsparse', 'lexer'));
// put `JSParser` in the global namespace
require(path.join(__dirname, '..', '..', 'packages',
                  'jsparse', 'parser'));

var mightHaveDocComments = function (source) {
  return /\/\*\*(?!\*)/.test(source);
};

var scanForDocComments = function (tree) {
  var comments = [];

  var scan = function (n) {
    if (! (n instanceof ParseNode))
      // `n` is a token (leaf of the syntax tree)
      return;

    if (n.name === "comment") {
      // A "comment" node represents a JS comment that appears
      // at statement level in the source code, without code
      // preceding it on the line where it starts.  It may be a
      // single-line or multi-line comment.  jsparse finds these
      // for us.
      //
      // We first determine if the comment is a "doc" comment.
      // Doc comments start with `/**` (exactly two asterisks in
      // a row), and end with `*/`.  If there are extra asterisks
      // in the closing, they are ignored (because considering them
      // to be content wouldn't make much sense).
      var commentText = n.children[0].text();
      var docCommentMatch = /^\/\*\*(?!\*)([\s\S]*?)\*+\/$/.exec(commentText);
      if (docCommentMatch) {
        var commentContents = docCommentMatch[1];
        var lines = commentContents.split('\n');
        if (lines.length > 1) {
          // Strip indentation and optional `*` from the beginning
          // of each line.  The first new line after the opening
          // punctuation determines the maximum indentation.
          // We record the number of whitespace characters at the start of
          // this line, and then we record whether a `*` comes next.
          // Using this information, for each subsequent
          // line, we strip a maximum of that many whitespace characters,
          // and if there was a star on the first line, we try to strip
          // a star if we can.  The goal is to support indentation and leading
          // `*` inside doc comments by stripping a fixed number of columns,
          // but also to be lenient and not strip off text.
          var linePrefixMatch = /^(\s*)(\*?)/.exec(lines[1]); // always matches
          var numSpaces = linePrefixMatch[1].length;
          var hasStar = !! linePrefixMatch[2];
          for(var i = 1; i < lines.length; i++) {
            var lineHere = lines[i];
            var numSpacesHere = /^\s*/.exec(lineHere)[0].length;
            var charsToDrop = Math.min(numSpaces, numSpacesHere);
            if (hasStar && lineHere.charAt(charsToDrop) === '*')
              charsToDrop++;
            lines[i] = lineHere.slice(charsToDrop);
          }
        }
        comments.push(lines.join('\n'));
      }
    } else {
      // Recurse on children of this syntax node.
      for(var i = 0; i < n.children.length; i++)
        scan(n.children[i]);
    }
  };

  scan(tree);

  return comments;
};

exports.getAPIDocs = function (appToScanToo) {
  var info = { packages: [] };

  console.log("Scanning for API docs...");

  var pkgs = packages.list();

  if (appToScanToo)
    pkgs = _.extend({ '': appToScanToo }, pkgs);

  _.each(pkgs, function (pkg, name) {
    var pkgInfo = { name: name, files: [] };
    info.packages.push(pkgInfo);

    // Keep a dictionary of files by relPath so that the package
    // can add the same file on client and server in separate add_files
    // calls, but we only scan it once.
    var filesAdded = {}; // relPath -> [where]

    if (pkg.on_use_handler) {
      pkg.on_use_handler({
        use: function () {},
        add_files: function (paths, where) {
          paths = paths ? (paths instanceof Array ? paths : [paths]) : [];
          where = where ? (where instanceof Array ? where : [where]) : [];
          _.each(paths, function (relPath) {
            if (/\.js$/.test(relPath)) {
              filesAdded[relPath] = _.union(
                filesAdded[relPath] || [], where);
            }
          });
        },
        // XXX the API we are implementing here is not very clean.
        // implement registered_extensions for the benefit of
        // packages.js / _scan_for_sources.
        registered_extensions: function () { return ['.js']; },
        include_tests: function () {},
        error: function () {}
      });
    }

    _.each(filesAdded, function (where, relPath) {
      var fileInfo = { path: relPath, comments: [] };
      pkgInfo.files.push(fileInfo);

      var fullPath = path.join(pkg.source_root, relPath);
      var A1 = +new Date;
      var source = fs.readFileSync(fullPath).toString();
      var A2 = +new Date;
      fileInfo.readMs = A2 - A1;
      var parseResult;

      var B1 = +new Date;
      if (! mightHaveDocComments(source)) {
        parseResult = "skipped";
      } else {
        var parser = new JSParser(source, {includeComments: true});
        try {
          var tree = parser.getSyntaxTree();
          fileInfo.comments = scanForDocComments(tree);
          parseResult = "success";
        } catch (parseError) {
          parseResult = "PARSE ERROR: " + parseError.message;
        }
      }
      var B2 = +new Date;
      fileInfo.parseMs = B2 - B1;
      fileInfo.parseResult = parseResult;
    });

  });

  console.log("DONE");

  return info;

};